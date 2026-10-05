# Archived: panel File cards

Shelved when the top File menu (menu bar, `src/ui/menus/menus.xml` +
`MENU_COMMANDS`/`handleMenuCommand` in `src/App.tsx`) was wired to the real
file actions. The panel used to carry its own File card select; that
duplicated the menu bar, so the cards were removed and every action now
flows through one layer:

- `src/ui/fileCommands.ts` — `FILE_COMMANDS`, `saveTarget`, `renameTarget`
- `ControlPanel.dispatchFileCommand` (via ref) — owns the gallery and
  New Document dialogs
- `src/components/NewDocumentDialog.tsx` — the New Document dialog

The snippets below are the removed code, kept for the card artwork and the
original dispatch order. Not compiled, not imported.

## Card icons (`ControlPanel.tsx`)

```tsx
// Glyph for a File menu card button: icon stacked above a short label.
function FileCardIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function OpenCardIcon() {
  return (
    <FileCardIcon>
      <path d="M3 7 h6 l2 2 h10 v9 H3 Z" />
      <path d="M3 7 v10" />
    </FileCardIcon>
  );
}

function NewCardIcon() {
  return (
    <FileCardIcon>
      <path d="M7 3 h7 l4 4 v14 H7 Z" />
      <path d="M12 11 v6 M9 14 h6" />
    </FileCardIcon>
  );
}

function SaveCardIcon() {
  return (
    <FileCardIcon>
      <path d="M5 4 h11 l3 3 v13 H5 Z" />
      <path d="M8 4 v5 h7 V4" />
      <path d="M8 20 v-6 h8 v6" />
    </FileCardIcon>
  );
}

function RenameCardIcon() {
  return (
    <FileCardIcon>
      <path d="M4 20 l1 -4 L16 5 l3 3 L8 19 Z" />
      <path d="M14 7 l3 3" />
    </FileCardIcon>
  );
}

function ExportCardIcon() {
  return (
    <FileCardIcon>
      <path d="M4 14 v6 h16 v-6" />
      <path d="M12 3 v10 M8 7 l4 -4 4 4" />
    </FileCardIcon>
  );
}

function ImportCardIcon() {
  return (
    <FileCardIcon>
      <path d="M4 14 v6 h16 v-6" />
      <path d="M12 4 v10 M8 10 l4 4 4 -4" />
    </FileCardIcon>
  );
}
```

## Card options and dispatch (`ControlPanel.tsx`)

```tsx
const [fileValue, setFileValue] = useState('file-none');

const FILE_OPTIONS: CustomSelectOption[] = [
  { value: 'hdr-file-doc', label: 'Document', header: true, columns: 2 },
  { value: 'file-open', label: 'Open', card: true, image: <OpenCardIcon />, title: 'Open a document from the gallery' },
  { value: 'file-new', label: 'New', card: true, image: <NewCardIcon />, title: 'Start a new document' },
  { value: 'file-save', label: 'Save', card: true, image: <SaveCardIcon />, title: 'Save to the gallery' },
  { value: 'file-rename', label: 'Rename', card: true, image: <RenameCardIcon />, title: 'Rename the open document' },
  { value: 'hdr-file-transfer', label: 'Transfer', header: true, columns: 2 },
  { value: 'file-export', label: 'Export', card: true, image: <ExportCardIcon />, title: 'Download the scene as SVG' },
  { value: 'file-import', label: 'Import', card: true, image: <ImportCardIcon />, title: 'Import an SVG file into the scene' },
  { value: 'hdr-file-learn', label: 'Learn', header: true },
  { value: 'file-tutorial', label: 'Tutorial', title: 'Start the guided tutorial' },
];

const handleFile = useCallback(
  (v: string) => {
    if (v === 'file-none') return;
    dismissSelects();
    switch (v) {
      case 'file-tutorial':
        onTutorialRequest?.();
        break;
      case 'file-open':
        openGallery('open');
        break;
      case 'file-new':
        dismissSelects();
        setNewDocOpen(true);
        break;
      case 'file-save': {
        const id = galleryCurrentId(browserStore());
        if (id) saveSceneToGallery(galleryCurrentName(browserStore()) ?? 'Untitled');
        else openGallery('save');
        break;
      }
      case 'file-rename':
        if (galleryCurrentId(browserStore())) openGallery('rename');
        else openGallery('save');
        break;
      case 'file-export': {
        const svg = engine.exportSceneSVG();
        if (!svg) break;
        const name = galleryCurrentName(browserStore()) ?? 'untitled';
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${name}.svg`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        break;
      }
      case 'file-import':
        importInputRef.current?.click();
        break;
      default:
        break;
    }
    // Reset to the placeholder label after acting.
    setFileValue('file-none');
  },
  [dismissSelects, engine, onTutorialRequest, openGallery, saveSceneToGallery],
);
```

## Rail mount (`ControlPanel.tsx`)

```tsx
<div className="rail-box" title="File: documents, import, export" data-tutorial-id="menu-file">
  <CustomSelect
    id="panelFileSelect"
    ariaLabel="File"
    placeholder="File"
    value={fileValue}
    options={FILE_OPTIONS}
    onChange={handleFile}
    openOnHover
    stickyOnClick
    onHoverOpen={handleSelectHoverOpen}
    forceCloseKey={selectCloseKey}
  />
</div>
```

Note: the `menu-file` tutorial target now resolves to the menu bar File
trigger (`AppMenu` renders `data-tutorial-id="menu-file"`), so the hello
tutorial keeps pointing at a File menu.
