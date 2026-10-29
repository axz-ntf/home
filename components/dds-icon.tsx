import type { CSSProperties } from 'react';
import './dds-icon.css';

// Names verified against the official DDS component bundle loaded by app/layout.tsx.
// https://fe-dds.dev.daum.net/components/icon
export type DdsIconName =
  | 'action-report' | 'add-thick' | 'add' | 'album' | 'announce'
  | 'arrow-down' | 'arrow-left' | 'arrow-right' | 'arrow-turn-down-right' | 'arrow-up-left'
  | 'arrow-up-right' | 'arrow-up' | 'audio-mute' | 'audio-on' | 'backspace'
  | 'badge-official' | 'badge-pin' | 'badge-table-verified' | 'bar-chart' | 'benefit'
  | 'blank' | 'bookmark-fill' | 'bookmark' | 'brand-kakao-fill-text' | 'brand-kakao-fill'
  | 'brand-kakao' | 'browser' | 'bulb' | 'calendar' | 'call'
  | 'camera-frame-left-bottom' | 'camera-frame-left-top' | 'camera-frame-right-bottom' | 'camera-frame-right-top' | 'camera'
  | 'card-cafe' | 'card-enter' | 'card-keyword' | 'card-news' | 'card-sports'
  | 'card-toast' | 'change-down' | 'change-flat' | 'change-new' | 'change-up'
  | 'channel-add' | 'chatbot' | 'check-thick' | 'check' | 'cheer'
  | 'chevron-down-thick' | 'chevron-down' | 'chevron-left-thick' | 'chevron-left-tight-thick' | 'chevron-left-tight'
  | 'chevron-left' | 'chevron-right-thick' | 'chevron-right-tight-thick' | 'chevron-right-tight' | 'chevron-right'
  | 'chevron-up-thick' | 'chevron-up' | 'clock-fill' | 'clock' | 'close-fill'
  | 'close-long' | 'close' | 'collect' | 'comment' | 'community-color'
  | 'community-fill' | 'community-like-color' | 'community-like-fill' | 'community-like' | 'community-old-color'
  | 'community-old-fill' | 'community-old' | 'community-pencil' | 'community-repost' | 'community-share'
  | 'community' | 'contents-color' | 'contents-fill' | 'contents' | 'copy'
  | 'd-logo' | 'delete' | 'edit' | 'entertainment' | 'exclamation'
  | 'expand' | 'favorite-add' | 'favorite-history' | 'favorite-list' | 'favorite-setting'
  | 'filter' | 'flash-slash' | 'flash' | 'flower' | 'folder-add'
  | 'folder-move' | 'folder-up' | 'folder' | 'follow' | 'font-scale'
  | 'font-size-big' | 'font-size-small' | 'fun' | 'gallery' | 'handle'
  | 'headline' | 'hide' | 'home-add' | 'home-color' | 'home-fill'
  | 'home' | 'http' | 'image-group' | 'image' | 'info'
  | 'keyboard-shift-fill' | 'keyboard-shift' | 'keypad-hide' | 'keypad-show' | 'keypad'
  | 'like-fill' | 'like' | 'list' | 'locate-me' | 'location-arrow-fill'
  | 'location-arrow' | 'lock-open' | 'lock' | 'login-cafe' | 'login-cloud'
  | 'login-mail' | 'login-my' | 'login' | 'logout' | 'loop-color'
  | 'loop-fill' | 'loop' | 'map-fill' | 'map' | 'media'
  | 'menu' | 'money' | 'more-horizontal' | 'more-vertical' | 'music'
  | 'news-climate' | 'news-culture' | 'news-economy' | 'news-home' | 'news-it'
  | 'news-life' | 'news-photo' | 'news-politics' | 'news-series' | 'news-society'
  | 'news' | 'notification-add' | 'notification-fill' | 'notification-list' | 'notification-slash-fill'
  | 'notification-slash' | 'notification' | 'now-talk' | 'open-chat' | 'pause'
  | 'payment' | 'person-slash' | 'person' | 'play-fill' | 'play-thick'
  | 'play' | 'question' | 'ranking' | 'refresh' | 'return'
  | 'safebot' | 'scan-code' | 'screen-capture' | 'screen-search' | 'search'
  | 'service-gate' | 'setting' | 'share' | 'shield-info' | 'shopping-bag'
  | 'shopping-color' | 'shopping-fill' | 'shopping-search' | 'shopping' | 'shorts'
  | 'side-menu' | 'sparkles' | 'sports-baseball-abroad' | 'sports-baseball' | 'sports-basketball'
  | 'sports-cartoon' | 'sports-esports' | 'sports-football-abroad' | 'sports-football' | 'sports-general'
  | 'sports-golf' | 'sports-home' | 'sports-volleyball' | 'star-fill' | 'star'
  | 'storage' | 'summary' | 'tab-move' | 'tab-setting' | 'table'
  | 'thumbs-down-fill' | 'thumbs-down' | 'thumbs-up-fill' | 'thumbs-up' | 'toolbar-hide'
  | 'toolbar-show' | 'trending-down' | 'trending-up' | 'unfollow' | 'video'
  | 'view' | 'voice' | 'web-number-box' | 'zzim-list' | 'zzim';

export type DdsIconProps = {
  name: DdsIconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
};

/** Decorative icon: give the surrounding link or button its accessible label. */
export function DdsIcon({ name, size, className, style }: DdsIconProps) {
  return (
    <dds-icon
      name={name}
      aria-hidden="true"
      className={className ? `dds-icon ${className}` : 'dds-icon'}
      style={size == null ? style : { fontSize: size, ...style }}
    />
  );
}
