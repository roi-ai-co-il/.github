// Applies the theme before first paint so there is no light flash.
//
// An explicit choice always wins. Without one the phone's own setting decides —
// before this, a phone in dark mode still opened a light app and stayed that
// way until its owner found the toggle in the header.
try {
  var saved = localStorage.getItem('theme');
  var dark = saved === 'dark' || saved === 'light'
    ? saved === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
