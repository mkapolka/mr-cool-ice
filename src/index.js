'use strict';
/* eslint-disable no-unused-vars */
var $ = window.$ = window.jQuery = require('jquery');
var _ = window._ = require('underscore');
var marked = window.marked = require('marked');
var Story = window.Story = require('./story');
var Passage = window.Passage = require('./passage');
/* eslint-enable no-unused-vars */

$(async function() {
	window.story = new Story($('tw-storydata'));
	await window.story.start($('#main'));
});
