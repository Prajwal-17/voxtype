/**
 * Reusable Tailwind utility compositions for Flow's application chrome.
 *
 * Keeping repeated utilities here gives the desktop UI one visual grammar without
 * reintroducing a semantic CSS layer or `@apply` component classes.
 */
export const ui = {
  iconButton:
    'inline-flex size-8 shrink-0 items-center justify-center rounded-control border-0 bg-transparent text-current transition-[transform,background-color] duration-150 ease-out enabled:active:scale-[.97] enabled:hover:bg-line disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none motion-reduce:active:scale-100',
  shortcut: 'inline-flex items-center gap-1 align-middle',
  settingRow:
    'flex items-center justify-between gap-6 border-b border-line py-4 last:border-b-0 last:pb-0 [&>div:first-child]:min-w-0 [&_label]:text-ui [&_label]:font-medium [&_p]:mt-1 [&_p]:max-w-lg [&_p]:text-ui [&_p]:text-muted max-[1050px]:gap-4 max-[700px]:flex-wrap',
  tooltip:
    'z-50 rounded-control bg-graphite px-3 py-2 text-caption text-inverse [transform-origin:var(--radix-tooltip-content-transform-origin)] [&_svg]:fill-graphite',
  dialogBackdrop: 'fixed inset-0 z-30 bg-graphite/40',
  dialogContent:
    'fixed top-1/2 left-1/2 z-40 w-[min(440px,calc(100vw-40px))] -translate-x-1/2 -translate-y-1/2 rounded-panel bg-surface p-7 shadow-dialog [&>p]:mt-4 [&>p]:text-body [&>p]:text-muted',
  dialogActions: 'mt-7 flex justify-end gap-2',
  appShell: 'flex min-h-screen selection:bg-accent-soft selection:text-accent-ink',
  sidebar:
    'group sidebar fixed inset-y-0 left-0 z-10 flex w-48 shrink-0 flex-col bg-graphite px-3 py-7 text-inverse [&>div:first-child]:mb-12 [&>div:first-child]:ml-3 max-[1050px]:w-44 max-[700px]:w-16 max-[700px]:px-2 max-[700px]:py-5 max-[700px]:[&>div:first-child]:mx-0 max-[700px]:[&>div:first-child]:mb-8 max-[700px]:[&>div:first-child]:justify-center max-[700px]:[&>div:first-child>span:last-child]:hidden',
  nav: 'flex flex-col gap-1',
  navItem:
    'flex h-11 w-full items-center gap-3 rounded-control border-0 bg-transparent px-3 text-left text-ui font-medium text-inverse-muted aria-[current=page]:bg-graphite-raised aria-[current=page]:text-inverse aria-[current=page]:[&>svg]:text-signal hover:not-aria-[current=page]:bg-graphite-raised hover:not-aria-[current=page]:text-inverse max-[700px]:justify-center max-[700px]:px-0 max-[700px]:[&>span]:hidden',
  navIndicator: 'ml-auto size-1 rounded-full bg-signal max-[700px]:hidden',
  sidebarBottom: 'mt-auto pt-12 max-[700px]:hidden',
  sidebarShortcut:
    'mb-5 grid w-full grid-cols-[16px_1fr] items-center gap-x-2 gap-y-2 rounded-control border border-graphite-line bg-transparent px-3 py-3 text-left text-caption text-inverse-muted hover:text-inverse [&_[data-shortcut]]:col-start-2',
  personalNote:
    'flex items-center gap-2.5 border-t border-graphite-line px-2 pt-5 [&>svg]:text-inverse-muted [&_strong]:block [&_strong]:text-caption [&_strong]:font-medium [&_strong]:text-inverse [&_div>span]:mt-1 [&_div>span]:block [&_div>span]:text-caption [&_div>span]:text-inverse-muted',
  helpLink:
    'mt-5 flex w-full items-center gap-2 border-0 bg-transparent px-2 text-caption text-inverse-muted hover:text-inverse [&>svg:last-child]:ml-auto',
  workspace: 'ml-48 min-w-0 flex-1 max-[1050px]:ml-44 max-[700px]:ml-16',
  topbar:
    'flex h-14 items-center justify-between gap-4 border-b border-line px-9 text-caption text-muted max-[1050px]:px-6 max-[700px]:px-4',
  connectionStatus:
    'flex items-center gap-2 data-[active=true]:text-accent data-[active=true]:[&_[data-status-dot]]:bg-accent max-[700px]:text-[11px]',
  statusDot: 'inline-block size-1.5 shrink-0 rounded-full bg-muted data-[live=true]:bg-accent',
  pageContent:
    'mx-auto max-w-6xl px-9 pt-9 pb-7 min-[1280px]:pt-12 max-[1050px]:px-6 max-[1050px]:py-7 max-[700px]:px-4 max-[700px]:py-6',
  pageHeading:
    'mb-7 flex items-center justify-between gap-5 [&_h1]:text-heading [&_h1]:font-semibold [&_h1]:tracking-[-.035em] [&_h1]:text-balance [&_p]:mt-2 [&_p]:text-ui [&_p]:text-muted max-[700px]:flex-wrap max-[700px]:items-start max-[700px]:gap-3 max-[700px]:[&_h1]:text-[26px]',
  localBadge: 'flex shrink-0 items-center gap-1.5 text-caption text-muted max-[1050px]:hidden',
  previewNotice: 'bg-warning-soft px-5 py-2 text-center text-caption text-warning',
  connectBanner:
    'mb-5 flex items-center gap-3 rounded-control bg-accent-soft px-4 py-3 text-accent-ink [&_strong]:text-ui [&_strong]:font-semibold [&_p]:mt-0.5 [&_p]:text-caption [&>button]:ml-auto max-[700px]:flex-wrap max-[700px]:[&>svg]:hidden max-[700px]:[&>button]:ml-0',
  dictationStudio:
    'grid grid-cols-[224px_minmax(0,1fr)] overflow-hidden rounded-panel border border-line bg-surface min-[1280px]:grid-cols-[248px_minmax(0,1fr)] max-[1050px]:grid-cols-1',
  recordingStation:
    'flex flex-col border-r border-line bg-subtle px-5 py-5 max-[1050px]:grid max-[1050px]:grid-cols-[minmax(0,1fr)_auto] max-[1050px]:gap-x-5 max-[1050px]:gap-y-3 max-[1050px]:border-r-0 max-[1050px]:border-b max-[700px]:gap-3 max-[700px]:p-4',
  stationHeading:
    'flex items-center gap-2 text-ui font-medium max-[1050px]:col-start-1 [&>[data-status-dot]]:ml-auto max-[1050px]:[&>[data-status-dot]]:ml-1',
  stationSignal:
    'flex flex-1 flex-col items-center justify-center pt-9 pb-5 max-[1050px]:col-start-1 max-[1050px]:row-start-2 max-[1050px]:flex-row max-[1050px]:flex-wrap max-[1050px]:justify-start max-[1050px]:gap-x-3 max-[1050px]:gap-y-2 max-[1050px]:p-0',
  stationTime:
    'mt-5 text-[32px] leading-[1.1] font-[450] tracking-[-.035em] text-ink tabular-nums max-[1050px]:m-0 max-[1050px]:text-2xl max-[700px]:text-xl',
  stationStatus: 'mt-2 text-caption text-muted max-[1050px]:m-0 max-[1050px]:w-full',
  recordControls:
    'flex flex-col items-stretch gap-2 [&_button]:px-3 max-[1050px]:col-start-2 max-[1050px]:row-span-2 max-[1050px]:row-start-1 max-[1050px]:justify-center max-[700px]:[&_button]:px-2.5 max-[700px]:[&_button]:text-xs',
  stationShortcut: 'flex min-h-9 items-center justify-center gap-2 text-caption text-muted',
  stationDetail:
    'mt-6 flex items-center justify-center gap-2 border-t border-line pt-4 text-caption text-muted [&>[data-status-dot]]:size-1 max-[1050px]:col-span-full max-[1050px]:m-0 max-[1050px]:justify-start max-[1050px]:pt-2.5',
  transcriptEditor:
    'flex min-h-[392px] min-w-0 flex-col min-[1280px]:min-h-[460px] max-[1050px]:min-h-[300px]',
  surfaceTopline:
    'flex items-center justify-between gap-3 border-b border-line px-6 py-4 text-caption text-muted [&>span:first-child]:flex [&>span:first-child]:items-center [&>span:first-child]:gap-2 [&>span:first-child]:font-medium [&>span:first-child]:text-ink max-[700px]:px-[18px]',
  transcriptArea: 'min-w-0 flex-1 px-7 py-8 max-[1050px]:p-6 max-[700px]:px-[18px]',
  transcriptEmpty:
    'flex items-start [&>div]:pt-4 [&_h2]:text-title [&_h2]:font-medium [&_p]:mt-2 [&_p]:max-w-72 [&_p]:text-ui [&_p]:text-muted max-[1050px]:[&>div]:pt-0',
  emptyCursor: 'mb-6 block h-8 w-0.5 bg-accent max-[1050px]:mb-4',
  transcriptEmptyHint: 'mt-8 block max-w-64 text-caption text-muted max-[1050px]:mt-5',
  transcriptText:
    'max-h-[370px] overflow-auto [overflow-wrap:anywhere] whitespace-pre-wrap text-transcript font-[440] tracking-[-.012em] max-[700px]:text-[17px]',
  transcriptCaret: 'ml-1 inline-block h-5 w-0.5 translate-y-1 bg-accent',
  surfaceFooter:
    'flex min-h-14 items-center justify-between gap-3 border-t border-line px-6 py-2 text-caption text-muted max-[700px]:px-[18px]',
  shortcutStrip:
    'mt-6 flex items-center gap-4 border-y border-line py-5 [&>svg]:text-muted [&_h2]:text-ui [&_h2]:font-semibold [&_p]:mt-1.5 [&_p]:text-caption [&_p]:text-muted [&>button]:ml-auto [&>button]:shrink-0 max-[1050px]:flex-wrap max-[1050px]:gap-3 max-[1050px]:[&>button]:ml-8 max-[700px]:[&>svg]:hidden max-[700px]:[&>button]:ml-0',
  pageFooter:
    'mt-5 flex items-center justify-between gap-4 text-caption text-muted [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 max-[700px]:flex-wrap max-[700px]:gap-2',
  sessionNotice:
    'mt-4 flex items-start gap-2 rounded-control bg-success-soft px-4 py-3 text-ui text-success [&>svg]:mt-0.5 [&>span]:min-w-0 [&>span]:[overflow-wrap:anywhere] [&_button]:ml-auto [&_button]:inline-flex [&_button]:shrink-0 [&_button]:items-center [&_button]:gap-1 [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-caption [&_button]:text-current',
  originalTranscript:
    'my-4 text-ui text-muted [&_summary]:w-fit [&_summary]:cursor-pointer [&_summary]:py-1.5 [&_summary]:font-medium [&_p]:my-2 [&_p]:whitespace-pre-wrap [&_p]:[overflow-wrap:anywhere] [&_p]:text-body',
  overlayPreview:
    'fixed bottom-7 left-[calc(50%+6rem)] z-20 w-[min(240px,calc(100vw-12rem-24px))] -translate-x-1/2 p-2 max-[1050px]:left-[calc(50%+5.5rem)] max-[1050px]:w-[min(240px,calc(100vw-11rem-24px))] max-[700px]:left-[calc(50%+2rem)] max-[700px]:w-[min(240px,calc(100vw-4rem-24px))]',
  overlayPreviewHeading: 'flex items-center justify-between pl-2 text-caption text-muted',
  settingsLayout: 'max-w-4xl',
  settingsSection: 'mb-7 border-b border-line pb-7',
  sectionTitle:
    'mb-5 [&_h2]:text-title [&_h2]:font-semibold [&_h2]:tracking-[-.02em] [&_p]:mt-1 [&_p]:text-ui [&_p]:text-muted',
  keyForm: '[&>label]:mb-2 [&>label]:block [&>label]:text-ui [&>label]:font-medium',
  keyInputRow: 'flex items-center gap-2 max-[700px]:flex-wrap',
  secretInput:
    'flex min-w-0 flex-1 items-center gap-2 rounded-control border border-line-strong bg-surface py-1 pr-1 pl-3 text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent max-[700px]:basis-full [&_input]:w-full [&_input]:min-w-0 [&_input]:border-0 [&_input]:bg-transparent [&_input]:py-1.5 [&_input]:text-ui [&_input]:text-ink [&_input]:outline-none [&_input]:placeholder:text-muted',
  fieldHint: 'mt-2 flex items-center gap-1.5 text-caption text-muted',
  sectionFootnote: 'mt-4 text-caption text-muted',
  textLink:
    'inline-flex items-center gap-1 border-0 bg-transparent p-0 text-caption text-accent hover:text-accent-hover hover:underline hover:underline-offset-[3px]',
  keyConnected:
    'flex items-center gap-3 rounded-control bg-surface p-4 [&>div]:min-w-0 [&>div]:flex-1 [&_strong]:text-ui [&_strong]:font-medium [&_p]:mt-1 [&_p]:text-caption [&_p]:text-muted max-[1050px]:flex-wrap',
  selectWithAction:
    'flex shrink-0 items-center gap-1.5 max-[700px]:w-full max-[700px]:max-w-full [&>span]:max-[700px]:flex-1',
  selectWrap:
    'relative inline-flex max-w-full items-center [&_select]:w-48 [&_select]:max-w-full [&_select]:appearance-none [&_select]:truncate [&_select]:rounded-control [&_select]:border [&_select]:border-line-strong [&_select]:bg-surface [&_select]:py-2 [&_select]:pr-8 [&_select]:pl-3 [&_select]:text-ui [&_select]:text-ink [&>svg]:pointer-events-none [&>svg]:absolute [&>svg]:right-3 [&>svg]:text-muted max-[1050px]:[&_select]:w-42 max-[700px]:w-full max-[700px]:[&_select]:w-full',
  microphoneTest:
    'mt-4 flex flex-wrap items-center gap-3 rounded-control bg-surface px-3 py-2 [&>div:first-child]:mr-auto [&>div:first-child]:flex [&>div:first-child]:items-center [&>div:first-child]:gap-2 [&>div:first-child]:text-caption [&>div:first-child]:text-muted',
  vocabularyInput:
    'block min-h-[108px] max-h-[260px] w-full resize-y rounded-control border border-line-strong bg-surface px-4 py-3 text-ui placeholder:text-muted',
  vocabularyFooter:
    'mt-2 flex justify-between gap-3 text-caption text-muted max-[700px]:flex-col max-[700px]:gap-1',
  savePreferences:
    'sticky bottom-0 z-10 mb-7 flex items-center justify-between gap-3 border-t border-line bg-canvas py-4 text-caption text-muted max-[700px]:items-start max-[700px]:[&>span]:max-w-[45%]',
  shortcutSetup: 'mb-5 rounded-control border-0 bg-surface p-4 [&_[data-shortcut]]:mt-2',
  diagnosticList: 'grid grid-cols-2 gap-x-6 gap-y-5 max-[700px]:grid-cols-1',
  diagnosticRow:
    'flex items-start gap-2 [&>svg]:mt-0.5 [&_strong]:text-ui [&_strong]:font-medium [&_p]:mt-1 [&_p]:text-caption [&_p]:text-muted',
  setupDisclosure:
    'mt-6 flex w-full items-center justify-between border-0 border-t border-line bg-transparent pt-5 text-ui font-medium',
  setupInstructions: 'pt-4 [&_p]:mb-3 [&_p]:text-ui [&_p]:text-muted',
  inlineError: 'mt-2 text-ui text-danger',
  historyToolbar:
    'mb-1 flex items-center justify-between gap-5 border-b border-line pb-5 [&>span]:shrink-0 [&>span]:text-caption [&>span]:text-muted max-[700px]:gap-3',
  searchField:
    'flex w-80 max-w-full items-center gap-2 rounded-control border border-line bg-surface px-3 text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent [&_input]:w-full [&_input]:min-w-0 [&_input]:border-0 [&_input]:bg-transparent [&_input]:py-2.5 [&_input]:text-ui [&_input]:text-ink [&_input]:outline-none [&_input]:placeholder:text-muted',
  historyEmpty:
    'flex flex-col items-center px-6 py-20 text-center [&_h2]:text-title [&_h2]:font-medium [&_p]:mt-2 [&_p]:mb-6 [&_p]:max-w-sm [&_p]:text-ui [&_p]:text-muted max-[700px]:px-0 max-[700px]:py-12 max-[700px]:[&_button]:whitespace-normal',
  historyItem:
    'border-b border-line py-6 [&>p]:mt-3 [&>p]:whitespace-pre-wrap [&>p]:[overflow-wrap:anywhere] [&>p]:text-body [&>p]:leading-[1.85]',
  historyMeta:
    'flex justify-between gap-3 text-caption text-muted tabular-nums [&>span_span]:px-1 max-[700px]:flex-wrap',
  historyItemFooter:
    'mt-3 flex items-center justify-between gap-3 [&>span]:text-caption [&>span]:text-muted [&>div]:flex [&>div]:gap-1 [&>div]:text-muted',
  emptyState: 'px-5 py-16 [&_p]:mt-3 [&_p]:mb-6 [&_p]:text-muted',
  loadingSurface:
    'flex flex-col gap-5 py-5 [&>div]:h-6 [&>div]:w-2/5 [&>div]:rounded-control [&>div]:bg-line [&>div:last-child]:h-72 [&>div:last-child]:w-full',
} as const;
