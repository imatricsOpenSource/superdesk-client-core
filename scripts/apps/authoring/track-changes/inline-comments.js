import {
    editor3DataKeys,
    getCustomDataFromEditorRawState,
} from 'core/editor3/helpers/editor3CustomData';

import {getLabelForFieldId} from 'apps/workspace/helpers/getLabelForFieldId';
import {fieldsMetaKeys, META_FIELD_NAME, getFieldMetadata, getFieldId} from 'core/editor3/helpers/fieldsMeta';

function getAllUserIdsFromComments(comments) {
    const users = [];

    comments.forEach(({data}) => {
        users.push(data.authorId);
        users.push(data.resolutionInfo.resolverUserId);
        data.replies.map((reply) => users.push(reply.authorId));
    });

    return users.filter((value, index, self) => self.indexOf(value) === index);
}

function filterUsers(users, ids) {
    return users.filter((user) => ids.includes(user._id));
}

function convertUsersArrayToObject(users) {
    const usersObj = {};

    users.forEach((user) => {
        usersObj[user._id] = user;
    });

    return usersObj;
}

InlineCommentsCtrl.$inject = ['$scope', 'userList', 'metadata', 'content'];
function InlineCommentsCtrl($scope, userList, metadata, content) {
    content.getCustomFields().then((customFields) => {
        const comments = Object.keys($scope.item[META_FIELD_NAME])
            .map((contentKey) => ({
                contentKey: contentKey,
                [fieldsMetaKeys.draftjsState]: getFieldMetadata($scope.item, contentKey, fieldsMetaKeys.draftjsState),
            }))
            .filter((obj) => obj[fieldsMetaKeys.draftjsState] != null)
            .map((obj) => (
                {
                    fieldName: getLabelForFieldId(getFieldId(obj.contentKey), customFields),
                    comments: getCustomDataFromEditorRawState(
                        obj[fieldsMetaKeys.draftjsState],
                        editor3DataKeys.RESOLVED_COMMENTS_HISTORY
                    ) || [],
                }
            ))
            .filter((obj) => obj.comments.length > 0);

        if (comments.length === 0) {
            $scope.items = [];
            return;
        }

        const userIds = getAllUserIdsFromComments([].concat(...comments.map((obj) => obj.comments)));

        userList.getAll()
            .then((users) => {
                $scope.users = convertUsersArrayToObject(filterUsers(users, userIds));
                $scope.items = comments;
            });
    });
}

angular
    .module('superdesk.apps.authoring.track-changes.inline-comments', [
        'superdesk.apps.authoring.widgets',
    ])
    .config([
        'authoringWidgetsProvider',
        function(authoringWidgetsProvider) {
            authoringWidgetsProvider.widget('inline-comments', {
                icon: 'comments',
                label: gettext('Resolved Inline comments'),
                template:
                'scripts/apps/authoring/track-changes/views/inline-comments-widget.html',
                order: 9,
                side: 'right',
                display: {
                    authoring: true,
                    packages: true,
                    killedItem: true,
                    legalArchive: false,
                    archived: false,
                    picture: true,
                    personal: true,
                },
            });
        },
    ])

    .controller('InlineCommentsCtrl', InlineCommentsCtrl);
