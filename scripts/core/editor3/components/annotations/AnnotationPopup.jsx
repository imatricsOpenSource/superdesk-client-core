import React from 'react';
import {UserAvatar} from 'apps/users/components';
import PropTypes from 'prop-types';
import moment from 'moment';
import {connect} from 'react-redux';
import {showPopup, deleteHighlight, PopupTypes} from '../../actions';
import {toHTML} from 'core/editor3';
import {convertFromRaw} from 'draft-js';
import ng from 'core/services/ng';

const Annotation = ({annotation, deleteHighlight, showPopup}) => {
    const {author, avatar, date, msg, annotationType: type} = annotation.data;
    const fromNow = moment(date).calendar();
    const fullDate = moment(date).format('MMMM Do YYYY, h:mm:ss a');
    const html = toHTML(convertFromRaw(JSON.parse(msg)));
    const modal = ng.get('modal');

    const editAnnotation = () => showPopup(PopupTypes.Annotation, {annotation});
    const deleteAnnotation = () => modal
        .confirm(gettext('The annotation will be deleted. Are you sure?'))
        .then(() => deleteHighlight(annotation));

    return (
        <div>
            <div className="highlights-popup__header">
                <UserAvatar displayName={author} pictureUrl={avatar} />
                <div className="user-info">
                    <div className="author-name">{author}</div>
                    <div className="date" title={fullDate}>{fromNow}</div>
                </div>
            </div>
            <div className="highlights-popup__type"><b>{gettext('Annotation type')}: </b>{type}</div>
            <div className="highlights-popup__html" dangerouslySetInnerHTML={{__html: html}} />
            <a className="btn btn--small btn--hollow" onClick={editAnnotation}>{gettext('Edit')}</a>
            <a className="btn btn--small btn--hollow" onClick={deleteAnnotation}>{gettext('Delete')}</a>
        </div>
    );
};

Annotation.propTypes = {
    showPopup: PropTypes.func,
    deleteHighlight: PropTypes.func,
    annotation: PropTypes.object
};

export const AnnotationPopup = connect(null, {
    showPopup,
    deleteHighlight
})(Annotation);
