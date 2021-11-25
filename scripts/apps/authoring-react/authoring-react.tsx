import React from 'react';
import {IArticle} from 'superdesk-api';
import {
    Button,
    ButtonGroup,
    Loader,
    SubNav,
    IconButton,
    Divider,
    NavButton,
} from 'superdesk-ui-framework/react';
import * as Layout from 'superdesk-ui-framework/react/components/Layouts';
import * as Nav from 'superdesk-ui-framework/react/components/Navigation';
import {gettext} from 'core/utils';
import {IContentProfileV2, authoringStorage} from './data-layer';
import {AuthoringSection} from './authoring-section';
import {previewItems} from 'apps/authoring/preview/fullPreviewMultiple';
import {EditorTest} from './ui-framework-authoring-test';
import {extensions, uiFrameworkAuthoringPanelTest} from 'appConfig';
import {widgetReactIntegration} from 'apps/authoring/widgets/widgets';
import {AuthoringWidgetLayoutComponent} from './widget-layout-component';
import {WidgetHeaderComponent} from './widget-header-component';
import {ISideBarTab} from 'superdesk-ui-framework/react/components/Navigation/SideBarTabs';
import {registerToReceivePatches, unregisterFromReceivingPatches} from 'apps/authoring-bridge/receive-patches';
import {addInternalEventListener} from 'core/internal-events';
import {SendItemReact} from 'core/send-item-react/send-item-react';
import {
    showUnsavedChangesPrompt,
    IUnsavedChangesActionWithSaving,
} from 'core/ui/components/prompt-for-unsaved-changes';
import {assertNever} from 'core/helpers/typescript-helpers';

interface IProps {
    itemId: IArticle['_id'];
    onClose(): void;
}

interface IStateLoaded {
    initialized: true;
    itemOriginal: IArticle;
    itemWithChanges: IArticle;
    profile: IContentProfileV2;
    openWidget?: {
        name: string;
        pinned: boolean;
    };
    sendToOrPublishSidebar?: boolean;

    /**
     * Prevents changes to state while async operation is in progress(e.g. saving).
     */
    loading: boolean;
}

type IState = {initialized: false} | IStateLoaded;

function waitForCssAnimation(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(
            () => {
                resolve();
            },
            500, // transition time taken from styles/sass/layouts.scss #authoring-container
        );
    });
}
export class AuthoringReact extends React.PureComponent<IProps, IState> {
    private eventListenersToRemoveBeforeUnmounting: Array<() => void>;

    constructor(props: IProps) {
        super(props);

        this.state = {
            initialized: false,
        };

        this.save = this.save.bind(this);
        this.discardUnsavedChanges = this.discardUnsavedChanges.bind(this);

        const setStateOriginal = this.setState.bind(this);

        this.setState = (...args) => {
            const {state} = this;

            // disallow changing state while loading (for example when saving is in progress)
            const allow: boolean = (() => {
                if (state.initialized !== true) {
                    return true;
                } else if (args[0]['loading'] === false) {
                    // it is allowed to change state while loading
                    // only if it sets loading to false
                    return true;
                } else {
                    return state.loading === false;
                }
            })();

            if (allow) {
                setStateOriginal(...args);
            }
        };

        widgetReactIntegration.pinWidget = () => {
            const state = this.state;

            if (state.initialized) {
                const nextState: IStateLoaded = {
                    ...state,
                    openWidget: {
                        ...state.openWidget,
                        pinned: !(state.openWidget?.pinned ?? false),
                    },
                };

                this.setState(nextState);
            }
        };
        widgetReactIntegration.getActiveWidget = () => {
            if (this.state.initialized) {
                return this.state.openWidget?.name ?? null;
            } else {
                return null;
            }
        };
        widgetReactIntegration.getPinnedWidget = () => {
            if (this.state.initialized) {
                const pinned = this.state.openWidget?.pinned === true;

                if (pinned) {
                    return this.state.openWidget.name;
                } else {
                    return null;
                }
            } else {
                return null;
            }
        };

        widgetReactIntegration.closeActiveWidget = () => {
            const state = this.state;

            if (state.initialized) {
                const nextState: IStateLoaded = {
                    ...state,
                    openWidget: undefined,
                };

                this.setState(nextState);
            }
        };

        widgetReactIntegration.WidgetHeaderComponent = WidgetHeaderComponent;
        widgetReactIntegration.WidgetLayoutComponent = AuthoringWidgetLayoutComponent;
    }

    componentDidMount() {
        Promise.all(
            [
                authoringStorage.getArticle(this.props.itemId).then((item) => {
                    return authoringStorage.getContentProfile(item.autosaved ?? item.saved).then((profile) => {
                        return {item, profile};
                    });
                }),
                waitForCssAnimation(),
            ],
        ).then((res) => {
            const [{item, profile}] = res;

            const nextState: IStateLoaded = {
                initialized: true,
                loading: false,
                itemOriginal: Object.freeze(item.saved),
                itemWithChanges: item.autosaved ?? item.saved,
                profile: profile,
            };

            this.setState(nextState);
        });

        registerToReceivePatches(this.props.itemId, (patch) => {
            const {state} = this;

            if (state.initialized) {
                this.setState({
                    ...state,
                    itemWithChanges: {
                        ...state.itemWithChanges,
                        ...patch,
                    },
                });
            }
        });

        this.eventListenersToRemoveBeforeUnmounting = [];

        this.eventListenersToRemoveBeforeUnmounting.push(
            addInternalEventListener(
                'dangerouslyOverwriteAuthoringData',
                (event) => {
                    if (event.detail._id === this.props.itemId) {
                        const patch = event.detail;

                        const {state} = this;

                        if (state.initialized) {
                            this.setState({
                                ...state,
                                itemWithChanges: {
                                    ...state.itemWithChanges,
                                    ...patch,
                                },
                                itemOriginal: {
                                    ...state.itemOriginal,
                                    ...patch,
                                },
                            });
                        }
                    }
                },
            ),
        );
    }

    componentWillUnmount() {
        unregisterFromReceivingPatches();

        for (const fn of this.eventListenersToRemoveBeforeUnmounting) {
            fn();
        }
    }

    componentDidUpdate(_prevProps, prevState: IState) {
        if (this.state.initialized && prevState.initialized) {
            if (this.state.itemWithChanges !== prevState.itemWithChanges) {
                if (this.state.itemWithChanges === this.state.itemOriginal) {
                    /**
                     * Item changed, but is now the same as original item.
                     * This means either article was saved, or changes discarded.
                     * In either case, autosaved data needs to be deleted.
                     */
                    authoringStorage.autosave.delete(this.state.itemWithChanges);
                } else {
                    authoringStorage.autosave.schedule(this.state.itemWithChanges);
                }
            }
        }
    }

    save(state: IStateLoaded): Promise<IArticle> {
        this.setState({
            ...state,
            loading: true,
        });

        return authoringStorage.saveArticle(state.itemWithChanges, state.itemOriginal).then((item: IArticle) => {
            const nextState: IStateLoaded = {
                ...state,
                loading: false,
                itemOriginal: Object.freeze(item),
                itemWithChanges: item,
            };

            this.setState(nextState);

            return item;
        });
    }

    discardUnsavedChanges(state: IStateLoaded): Promise<void> {
        return authoringStorage.autosave.delete(state.itemWithChanges).then(() => {
            return new Promise((resolve) => {
                const stateNext: IStateLoaded = {
                    ...state,
                    itemWithChanges: state.itemOriginal,
                };

                this.setState(stateNext, () => {
                    resolve();
                });
            });
        });
    }

    render() {
        const state = this.state;

        if (state.initialized !== true) {
            return null;
        }

        if (uiFrameworkAuthoringPanelTest) {
            return (
                <div className="sd-authoring-react">
                    <EditorTest />
                </div>
            );
        }

        const widgetsFromExtensions = Object.values(extensions)
            .flatMap((extension) => extension.activationResult?.contributions?.authoringSideWidgets ?? [])
            .filter((widget) => widget.isAllowed?.(state.itemWithChanges) ?? true);

        const sidebarTabs: Array<ISideBarTab> = widgetsFromExtensions.map((widget) => ({
            icon: widget.icon,
            size: 'big',
            tooltip: widget.label,
            onClick: () => {
                const selfToggled = state.openWidget != null && widget.label === state.openWidget?.name;

                const nextState: IStateLoaded = {
                    ...state,
                    openWidget: selfToggled
                        ? undefined
                        : {name: widget.label, pinned: state.openWidget?.pinned ?? false},
                };

                this.setState(nextState);
            },
        }));

        const OpenWidgetComponent = (() => {
            if (state.sendToOrPublishSidebar === true) {
                return (props: {article: IArticle}) => (
                    <SendItemReact
                        items={[props.article]}
                        closeSendToView={() => {
                            const nextState: IStateLoaded = {
                                ...state,
                                sendToOrPublishSidebar: false,
                            };

                            this.setState(nextState);
                        }}
                        onSendBefore={() => new Promise((resolve, reject) => {
                            if (state.itemWithChanges === state.itemOriginal) {
                                resolve([state.itemOriginal]);
                                return;
                            }

                            return showUnsavedChangesPrompt(true).then(({action, closePromptFn}) => {
                                if (action === IUnsavedChangesActionWithSaving.cancelAction) {
                                    closePromptFn();
                                    reject();
                                } else if (action === IUnsavedChangesActionWithSaving.discardChanges) {
                                    this.discardUnsavedChanges(state).then(() => {
                                        closePromptFn();

                                        if (this.state.initialized) {
                                            resolve([this.state.itemOriginal]);
                                        }
                                    });
                                } else if (action === IUnsavedChangesActionWithSaving.save) {
                                    this.save(state).then(() => {
                                        closePromptFn();

                                        if (this.state.initialized) {
                                            resolve([this.state.itemOriginal]);
                                        }
                                    });
                                } else {
                                    assertNever(action);
                                }
                            });
                        })}
                        markupV2
                    />
                );
            } else if (state.openWidget != null) {
                return widgetsFromExtensions.find(({label}) => state.openWidget.name === label).component;
            } else {
                return null;
            }
        })();

        const pinned = state.openWidget?.pinned === true;

        return (
            <div className="sd-authoring-react">
                {
                    state.loading && (
                        <Loader overlay />
                    )
                }

                <Layout.AuthoringFrame
                    header={(
                        <SubNav>
                            <ButtonGroup align="end">
                                <Button
                                    text={gettext('Close')}
                                    style="hollow"
                                    onClick={() => {
                                        this.setState({
                                            ...state,
                                            loading: true,
                                        });

                                        authoringStorage.closeAuthoring(
                                            state.itemWithChanges,
                                            state.itemOriginal,
                                            () => this.props.onClose(),
                                        ).then(() => {
                                            this.setState({
                                                ...state,
                                                loading: false,
                                            });
                                        });
                                    }}
                                />

                                <Button
                                    text={gettext('Save')}
                                    style="filled"
                                    type="primary"
                                    disabled={state.itemWithChanges === state.itemOriginal}
                                    onClick={() => {
                                        this.save(state);
                                    }}
                                />

                                <Divider size="mini" />

                                <ButtonGroup subgroup={true} spaces="no-space">
                                    <NavButton
                                        type="highlight"
                                        icon="send-to"
                                        iconSize="big"
                                        text={gettext('Send to / Publish')}
                                        onClick={() => {
                                            const nextState: IStateLoaded = {
                                                ...state,
                                                sendToOrPublishSidebar: !(state.sendToOrPublishSidebar ?? false),
                                            };

                                            this.setState(nextState);
                                        }}
                                    />
                                </ButtonGroup>
                            </ButtonGroup>
                        </SubNav>
                    )}
                    main={(
                        <Layout.AuthoringMain
                            toolBar={(
                                <React.Fragment>
                                    <ButtonGroup align="end">
                                        <IconButton
                                            icon="preview-mode"
                                            ariaValue={gettext('Print preview')}
                                            onClick={() => {
                                                previewItems([state.itemOriginal]);
                                            }}
                                        />
                                    </ButtonGroup>
                                </React.Fragment>
                            )}
                            authoringHeader={(
                                <div>
                                    <AuthoringSection
                                        fields={state.profile.header}
                                        item={state.itemWithChanges}
                                        onChange={(itemChanged) => {
                                            const nextState: IStateLoaded = {
                                                ...state,
                                                itemWithChanges: itemChanged,
                                            };

                                            this.setState(nextState);
                                        }}
                                    />
                                </div>
                            )}
                        >
                            <div>
                                <AuthoringSection
                                    fields={state.profile.content}
                                    item={state.itemWithChanges}
                                    onChange={(itemChanged) => {
                                        const nextState: IStateLoaded = {
                                            ...state,
                                            itemWithChanges: itemChanged,
                                        };

                                        this.setState(nextState);
                                    }}
                                />
                            </div>
                        </Layout.AuthoringMain>
                    )}
                    sideOverlay={
                        !pinned && OpenWidgetComponent != null
                            ? (
                                <OpenWidgetComponent
                                    article={{...state.itemWithChanges}}
                                />
                            )
                            : undefined
                    }
                    sideOverlayOpen={!pinned && OpenWidgetComponent != null}
                    sidePanel={
                        pinned && OpenWidgetComponent != null
                            ? (
                                <OpenWidgetComponent
                                    article={{...state.itemWithChanges}}
                                />
                            )
                            : undefined
                    }
                    sidePanelOpen={pinned && OpenWidgetComponent != null}
                    sideBar={(
                        <Nav.SideBarTabs
                            items={sidebarTabs}
                        />
                    )}
                />
            </div>
        );
    }
}
