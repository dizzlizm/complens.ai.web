/**
 * Complens.ai Chat Widget Loader
 *
 * Embeds the Complens chat widget on any website via an iframe.
 *
 * Usage (page-based):
 *   <script>
 *     window.ComplensChat = { pageId: "YOUR_PAGE_ID", workspaceId: "YOUR_WORKSPACE_ID" };
 *   </script>
 *   <script src="https://dev.complens.ai/embed/chat-loader.js" async></script>
 *
 * Usage (site-based — no landing page required):
 *   <script>
 *     window.ComplensChat = { siteId: "YOUR_SITE_ID", workspaceId: "YOUR_WORKSPACE_ID" };
 *   </script>
 *   <script src="https://dev.complens.ai/embed/chat-loader.js" async></script>
 */
(function () {
  'use strict';

  var config = window.ComplensChat;
  if (!config || (!config.pageId && !config.siteId) || !config.workspaceId) {
    console.error(
      '[Complens Chat] Missing configuration. Set window.ComplensChat = { pageId: "..." OR siteId: "...", workspaceId: "..." } before loading the script.'
    );
    return;
  }

  // Prevent double-initialization
  if (document.getElementById('complens-chat-frame')) return;

  // Determine the host from the script src or use default
  var scriptTag = document.currentScript;
  var host = '';
  if (scriptTag && scriptTag.src) {
    var url = new URL(scriptTag.src);
    host = url.origin;
  }
  if (!host) {
    host = 'https://dev.complens.ai';
  }

  // Build iframe URL with either pageId or siteId
  var iframeSrc = host + '/embed/chat?ws=' + encodeURIComponent(config.workspaceId);
  if (config.siteId) {
    iframeSrc += '&site_id=' + encodeURIComponent(config.siteId);
  } else {
    iframeSrc += '&page_id=' + encodeURIComponent(config.pageId);
  }

  // Create iframe
  var iframe = document.createElement('iframe');
  iframe.id = 'complens-chat-frame';
  iframe.src = iframeSrc;
  iframe.allow = 'clipboard-write';
  iframe.style.cssText =
    'position:fixed;bottom:0;right:0;width:420px;height:600px;' +
    'border:none;z-index:2147483647;background:transparent;' +
    'pointer-events:none;';

  // Allow the iframe content to receive clicks while the frame itself is transparent
  iframe.setAttribute('allowtransparency', 'true');

  document.body.appendChild(iframe);

  // Listen for messages from the iframe to handle resizing & pointer-events
  window.addEventListener('message', function (event) {
    if (!event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'complens-chat-resize') {
      // Auto-resize iframe height
      var h = event.data.height;
      if (h && typeof h === 'number') {
        iframe.style.height = Math.min(h, window.innerHeight - 20) + 'px';
      }
    }

    if (event.data.type === 'complens-chat-active') {
      // Chat is open - allow clicks through entire iframe
      iframe.style.pointerEvents = 'auto';
    }

    if (event.data.type === 'complens-chat-inactive') {
      // Chat is closed - only the bubble should be clickable
      // We keep pointer-events auto so the bubble can be clicked
      iframe.style.pointerEvents = 'auto';
    }
  });

  // After iframe loads, enable pointer events so the bubble is clickable
  iframe.addEventListener('load', function () {
    iframe.style.pointerEvents = 'auto';
  });
})();
