import React from 'react';
import ReactDOM from 'react-dom';
import { decode } from 'draft-js/lib/DraftOffsetKey';
import Animate from 'rc-animate';

import cx from 'classnames';
import scrollIntoView from 'dom-scroll-into-view';

import Nav from './Nav.react';
import SuggetionWrapper from './SuggestionWrapper.react';

import insertMention from '../utils/insertMention';
import clearMention from '../utils/clearMention';
import getOffset from '../utils/getOffset';
import getMentions from '../utils/getMentions';
import getSearchWord from '../utils/getSearchWord';

const isNotFalse = (i) => i !== false;
export default class Suggestions extends React.Component {
  constructor() {
    super();
    this.state = {
      isActive: false,
      focusedIndex: 0,
      container: false,
    };
  }

  componentDidMount() {
    this.props.callbacks.onChange = this.onEditorStateChange;
  }
  componentWillReceiveProps(nextProps) {
    if (nextProps.suggestions.length !== this.props.suggestions.length) {
      this.setState({
        focusedIndex: 0,
      });
    }
  }

  onEditorStateChange = (editorState) => {
    const offset = this.props.store.getOffset();
    if (offset.size === 0) {
      return editorState;
    }
    const selection = editorState.getSelection();
    // 修复: 焦点移出再移入时, dropdown 会闪动一下
    // 原因: https://github.com/facebook/draft-js/blob/67c5e69499e3b0c149ce83b004872afdf4180463/src/component/handlers/edit/editOnFocus.js#L33
    // 此处强制 update 了一下,因此 onEditorStateChange 会 call 两次
    if (!this.props.callbacks.getEditorState().getSelection().getHasFocus()
      && selection.getHasFocus()) {
      return editorState;
    }

    const { word } = getSearchWord(editorState, selection);

    const selectionInsideMention = offset.map(({ offsetKey }) => {
      const { blockKey, decoratorKey, leafKey } = decode(offsetKey);
      if (blockKey !== selection.anchorKey) {
        return false;
      }
      const leaf = editorState.getBlockTree(blockKey).getIn([decoratorKey, 'leaves', leafKey]);
      if (!leaf) {
        return false;
      }
      const startKey = leaf.get('start');
      const endKey = leaf.get('end');
      // 处理只有一个 `@` 符号时的情况
      if (!word) {
        return false;
      }
      if (startKey === endKey - 1) {
        return selection.anchorOffset >= startKey + 1 && selection.anchorOffset <= endKey
          ? offsetKey
          : false;
      }
      return selection.anchorOffset > startKey + 1 && selection.anchorOffset <= endKey
        ? offsetKey
        : false;
    });

    const selectionInText = selectionInsideMention.some(isNotFalse);
    this.activeOffsetKey = selectionInsideMention.find(isNotFalse);
    const trigger = this.props.store.getTrigger(this.activeOffsetKey);

    if (!selectionInText || !selection.getHasFocus()) {
      this.closeDropDown();
      return editorState;
    }

    const searchValue = word.substring(trigger.length, word.length);
    if (this.lastSearchValue !== searchValue || this.lastTrigger !== trigger) {
      this.lastSearchValue = searchValue;
      this.lastTrigger = trigger;
      this.props.onSearchChange(searchValue, trigger);
    }
    if (!this.state.active) {
      this.openDropDown();
    }
    return editorState;
  }
  onMentionSelect(mention, data) {
    const editorState = this.props.callbacks.getEditorState();
    const { store, onSelect } = this.props;
    const trigger = store.getTrigger(this.activeOffsetKey);
    if (onSelect) {
      onSelect(mention, data || mention);
    }
    if (this.props.noRedup) {
      const mentions = getMentions(editorState, trigger);
      if (mentions.indexOf(`${trigger}${mention}`) !== -1) {
        console.warn('you have specified `noRedup` props but have duplicated mentions.');
        this.closeDropDown();
        this.props.callbacks.setEditorState(
          clearMention(editorState),
        );
        return;
      }
    }
    this.props.callbacks.setEditorState(
      insertMention(editorState, `${trigger}${mention}`, data, this.props.mode)
    , true);
    this.closeDropDown();
  }
  onUpArrow = (ev) => {
    ev.preventDefault();
    if (this.props.suggestions.length > 0) {
      const newIndex = this.state.focusedIndex - 1;
      this.setState({
        focusedIndex: Math.max(newIndex, 0),
      });
    }
  }
  onBlur = (ev) => {
    ev.preventDefault();
    this.closeDropDown();
  }
  onDownArrow = (ev) => {
    ev.preventDefault();
    const newIndex = this.state.focusedIndex + 1;
    this.setState({
      focusedIndex: newIndex >= this.props.suggestions.length ? 0 : newIndex,
    });
  }
  getPositionStyle(isActive, position) {
    if (this.props.getSuggestionStyle) {
      return this.props.getSuggestionStyle(isActive, position);
    }
    const container = this.props.getSuggestionContainer ? this.state.container : document.body;
    const offset = getOffset(container);
    return position ? {
      position: 'absolute',
      left: `${position.left - offset.left}px`,
      top: `${position.top - offset.top}px`,
      ...this.props.style,
    } : {};
  }
  getContainer = () => {
    const popupContainer = document.createElement('div');
    let mountNode;
    if (this.props.getSuggestionContainer) {
      mountNode = this.props.getSuggestionContainer();
      popupContainer.style.position = 'relative';
    } else {
      mountNode = document.body;
    }
    mountNode.appendChild(popupContainer);
    return popupContainer;
  }
  handleKeyBinding = (command) => {
    return command === 'split-block';
  }
  handleReturn = (ev) => {
    ev.preventDefault();
    const selectedSuggestion = this.props.suggestions[this.state.focusedIndex];
    if (selectedSuggestion) {
      if (React.isValidElement(selectedSuggestion)) {
        this.onMentionSelect(selectedSuggestion.props.value, selectedSuggestion.props.data);
      } else {
        this.onMentionSelect(selectedSuggestion);
      }
      this.lastSearchValue = null;
      this.lastTrigger = null;
      return true;
    }
    return false;
  }
  openDropDown() {
    this.props.callbacks.onUpArrow = this.onUpArrow;
    this.props.callbacks.handleReturn = this.handleReturn;
    this.props.callbacks.handleKeyBinding = this.handleKeyBinding;
    this.props.callbacks.onDownArrow = this.onDownArrow;
    this.props.callbacks.onBlur = this.onBlur;
    this.setState({
      active: true,
      container: this.state.container || this.getContainer(),
    });
  }
  closeDropDown() {
    this.props.callbacks.onUpArrow = null;
    this.props.callbacks.handleReturn = null;
    this.props.callbacks.handleKeyBinding = null;
    this.props.callbacks.onDownArrow = null;
    this.props.callbacks.onBlur = null;
    this.setState({
      active: false,
    });
  }
  renderReady = () => {
    const focusItem = ReactDOM.findDOMNode(this.refs.focusItem);
    const container = this.refs.dropdownContainer;
    if (!container) {
      return;
    }
    const { active } = this.state;
    const { activeOffsetKey } = this;
    const offset = this.props.store.getOffset();
    const dropDownPosition = offset.get(activeOffsetKey);
    if (active && dropDownPosition) {
      const dropDownStyle = this.getPositionStyle(true, dropDownPosition.position());
      Object.keys(dropDownStyle).forEach((key) => {
        container.style[key] = dropDownStyle[key];
      });
    }

    if (!focusItem) {
      return;
    }
    scrollIntoView(focusItem, container, {
      onlyScrollIfNeeded: true,
    });
  }
  getNavigations = () => {
    const { prefixCls, suggestions } = this.props;
    const { focusedIndex } = this.state;
    return suggestions.length ? React.Children.map(suggestions, (element, index) => {
      const focusItem = index === focusedIndex;
      const ref = focusItem ? 'focusItem' : null;
      const mentionClass = cx(`${prefixCls}-dropdown-item`, {
        focus: focusItem,
      });
      if (React.isValidElement(element)) {
        return React.cloneElement(element, {
          className: mentionClass,
          onMouseDown: this.onMentionSelect.bind(this, element.props.value, element.props.data),
          ref,
        });
      }
      return (<Nav ref={ref}
        className={mentionClass}
        onMouseDown={this.onMentionSelect.bind(this, element)}
      >{element}</Nav>);
    }, this) :
    <div className={`${prefixCls}-dropdown-notfound ${prefixCls}-dropdown-item`}>
      {this.props.notFoundContent}
    </div>;
  }
  render() {
    const { prefixCls, suggestions, className } = this.props;
    const { container } = this.state;
    const cls = cx({
      [`${prefixCls}-dropdown`]: true,
      ...className,
    });

    const navigations = this.getNavigations();

    return container ? (<SuggetionWrapper renderReady={this.renderReady} container={container}>
      <Animate
        transitionName="slide-up"
      >
        { this.state.active ?
          <div className={cls} ref="dropdownContainer">
            {navigations}
          </div>
          : null }
      </Animate>
    </SuggetionWrapper>) : null;
  }
}

Suggestions.propTypes = {
  callbacks: React.PropTypes.object,
  suggestions: React.PropTypes.array,
  store: React.PropTypes.object,
  onSearchChange: React.PropTypes.func,
  prefix: React.PropTypes.oneOfType(
    [React.PropTypes.string, React.PropTypes.arrayOf(React.PropTypes.string)]
  ),
  prefixCls: React.PropTypes.string,
  mode: React.PropTypes.string,
  style: React.PropTypes.object,
  onSelect: React.PropTypes.func,
  getSuggestionContainer: React.PropTypes.func,
  notFoundContent: React.PropTypes.any,
  getSuggestionStyle: React.PropTypes.func,
  className: React.PropTypes.string,
  noRedup: React.PropTypes.bool,
};
