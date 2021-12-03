import React from 'react';
import ng from 'core/services/ng';
import {gettext} from 'core/utils';
import {MultiSelect} from 'core/ui/components/MultiSelect';
import {ToggleBox, FormLabel} from 'superdesk-ui-framework/react';
import {ControlledVocabulariesSelect} from './controller-vocabularies-select';
import {IArticle} from 'superdesk-api';

export type IPublishingTarget = Pick<IArticle, 'target_subscribers' | 'target_regions' | 'target_types'>;

interface IRegion {
    qcode: string;
    name: string;
}

interface ISubscriberType {
    name: string;
    qcode: string;
    formats: Array<{name: string; qcode: string}>;
}

/**
 * Avoids generating useless patches
 */
export function getPublishingTargetPatch(item: IArticle, publishingTarget: IPublishingTarget) {
    const patch: Partial<IArticle> = {};

    function nullableArrayChanged(arr1: Array<unknown> | null | undefined, arr2: Array<unknown> | null | undefined) {
        if ((arr1 ?? []).length === 0 && (arr2 ?? []).length === 0) {
            return false;
        } else {
            return true;
        }
    }

    if (
        nullableArrayChanged(item.target_subscribers, publishingTarget.target_subscribers)
    ) {
        patch.target_subscribers = publishingTarget.target_subscribers;
    }

    if (
        nullableArrayChanged(item.target_regions, publishingTarget.target_regions)
    ) {
        patch.target_regions = publishingTarget.target_regions;
    }

    if (
        nullableArrayChanged(item.target_types, publishingTarget.target_types)
    ) {
        patch.target_types = publishingTarget.target_types;
    }

    return patch;
}

interface IProps {
    value: IPublishingTarget;
    onChange(value: IPublishingTarget): void;
}

export class PublishingTargetSelect extends React.PureComponent<IProps> {
    render() {
        const metadata = ng.get('metadata');
        const subscribers: Array<{_id: string; name: string}> = metadata.values.customSubscribers;
        const regions: Array<IRegion> = metadata.values.geographical_restrictions;
        const subscriberTypes: Array<ISubscriberType> = metadata.values.subscriberTypes;

        return (
            <ToggleBox title={gettext('Target')} initiallyOpen>
                <FormLabel text={gettext('Target subscribers')} />

                <div style={{paddingTop: 5}}>
                    <MultiSelect
                        items={subscribers.map(({_id, name}) => ({id: _id, label: name}))}
                        values={this.props.value.target_subscribers.map(({_id}) => _id)}
                        onChange={(val) => {
                            this.props.onChange({
                                ...this.props.value,
                                target_subscribers: subscribers.filter(({_id}) => val.includes(_id)),
                            });
                        }}
                    />
                </div>

                <div style={{paddingTop: 20}}>
                    <FormLabel text={gettext('Target regions')} />
                </div>

                <div style={{paddingTop: 5}}>
                    <ControlledVocabulariesSelect
                        vocabularies={regions}
                        value={this.props.value.target_regions}
                        onChange={(val) => {
                            this.props.onChange({
                                ...this.props.value,
                                target_regions: val,
                            });
                        }}
                    />
                </div>

                <div style={{paddingTop: 20}}>
                    <FormLabel text={gettext('Target types')} />
                </div>

                <div style={{paddingTop: 5}}>
                    <ControlledVocabulariesSelect
                        vocabularies={subscriberTypes}
                        value={this.props.value.target_types}
                        onChange={(val) => {
                            this.props.onChange({
                                ...this.props.value,
                                target_types: val,
                            });
                        }}
                    />
                </div>

            </ToggleBox>
        );
    }
}
