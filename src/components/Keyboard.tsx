// On-screen keyboard: display-only key indicators (no click behavior,
// mirroring the original). Highlight follows physical key activity.
interface KeyDef {
  id: string;
  dataKey: string;
  className: string;
  transform?: string;
  html: string;
  bg?: string;
}

// Subtle ghost glyph behind the legend: 24x24, currentColor, decorative.
const BG_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const bg = (inner: string): string => `<svg ${BG_ATTRS}>${inner}</svg>`;

const ROW2: KeyDef[] = [
  { id: 'Tab', dataKey: 'tab', className: 'keyboardkey tabKey OtherKey enabledButton', html: 'Select Objects', bg: bg('<rect x="5" y="5" width="14" height="14" rx="1" stroke-dasharray="3 2"/>') },
  { id: 'KeyQ', dataKey: 'q', className: 'keyboardkey KeyQ operationButton enabledButton cancelButton', transform: 'translate(-45%, 0%)', html: 'cancel', bg: bg('<path d="M6 6 L18 18 M18 6 L6 18"/>') },
  { id: 'KeyW', dataKey: 'w', className: 'keyboardkey wKey operationButton enabledButton', html: 'stamp', bg: bg('<rect x="4" y="8" width="10" height="10" rx="1"/><rect x="10" y="6" width="10" height="10" rx="1"/>') },
  { id: 'KeyE', dataKey: 'e', className: 'keyboardkey eKey ', html: '' },
  { id: 'KeyR', dataKey: 'r', className: 'keyboardkey rKey ', transform: 'translate(-45%, 0%)', html: '' },
  { id: 'KeyT', dataKey: 't', className: 'keyboardkey tKey ', transform: 'translate(-45%, 0%)', html: '' },
  { id: 'KeyY', dataKey: 'y', className: 'keyboardkey yKey drawingButton enabledButton rectangleButton', transform: 'translate(-45%, 0%)', html: 'Rect.<br/>by centerline', bg: bg('<rect x="3" y="8" width="18" height="8" rx="1"/><path d="M2 12 H22"/>') },
  { id: 'KeyU', dataKey: 'u', className: 'keyboardkey uKey drawingButton enabledButton rectangleButton', transform: 'translate(-45%, 0%)', html: 'Rect.<br/>by 2 edges', bg: bg('<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 5 H20 M4 5 V19" stroke-width="2.6"/>') },
  { id: 'KeyI', dataKey: 'i', className: 'keyboardkey iKey drawingButton enabledButton rectangleButton', transform: 'translate(-47%, 0%)', html: 'Rect.<br/>by diag.', bg: bg('<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 19 L20 5"/>') },
  { id: 'KeyO', dataKey: 'o', className: 'keyboardkey oKey drawingButton enabledButton quadButton', transform: 'translate(-45%, 0%)', html: 'Quad<br/>4 pts', bg: bg('<path d="M5 19 L9 5 L19 8 L14 20 Z"/>') },
  { id: 'KeyP', dataKey: 'p', className: 'keyboardkey pKey ', html: '' },
  { id: 'BracketLeft', dataKey: '[', className: 'keyboardkey  bracketLeftKey operationButton enabledButton', html: 'scale -', bg: bg('<path d="M4 4 L8 8 M20 4 L16 8 M20 20 L16 16 M4 20 L8 16"/>') },
  { id: 'BracketRight', dataKey: ']', className: 'keyboardkey  bracketRightKey operationButton enabledButton', html: 'scale +', bg: bg('<path d="M9 4 H4 V9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15"/>') },
  { id: 'Backslash', dataKey: '\\', className: 'keyboardkey  backslashKey', html: '' },
];

const ROW3: KeyDef[] = [
  { id: 'CapsLock', dataKey: 'capslock', className: 'keyboardkey capsLockKey OtherKey hidden', html: '' },
  { id: 'KeyA', dataKey: 'a', className: 'keyboardkey KeyA endButton', transform: 'translate(-27%, 0%)', html: '<b>END</b><br />', bg: bg('<rect x="6" y="6" width="12" height="12" rx="1"/>') },
  { id: 'KeyS', dataKey: 's', className: 'keyboardkey sKey toggleButton enabledButton', transform: 'translate(-27%, 0%)', html: 'toggle<br/>stroke', bg: bg('<path d="M5 19 L19 5" stroke-width="2.6"/>') },
  { id: 'KeyD', dataKey: 'd', className: 'keyboardkey dKey toggleButton enabledButton', transform: 'translate(-27%, 0%)', html: 'toggle<br/>fill', bg: bg('<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none"/>') },
  { id: 'KeyF', dataKey: 'f', className: 'keyboardkey fKey drawingButton', transform: 'translate(-27%, 0%)', html: 'sharp</br>point', bg: bg('<path d="M4 20 L12 4 L20 20"/>') },
  { id: 'KeyG', dataKey: 'g', className: 'keyboardkey gKey drawingButton enabledButton', transform: 'translate(-27%, 0%)', html: 'spline<br/>point', bg: bg('<path d="M4 18 C8 18 8 6 12 6 S16 14 20 14"/>') },
  { id: 'KeyH', dataKey: 'h', className: 'keyboardkey hKey ', transform: 'translate(-27%, 0%)', html: '' },
  { id: 'KeyJ', dataKey: 'j', className: 'keyboardkey jKey ', transform: 'translate(-27%, 0%)', html: '' },
  { id: 'KeyK', dataKey: 'k', className: 'keyboardkey kKey ', transform: 'translate(-27%, 0%)', html: '' },
  { id: 'KeyL', dataKey: 'l', className: 'keyboardkey lKey ', transform: 'translate(-27%, 0%)', html: 'Grid<br/>Toggle', bg: bg('<path d="M4 4 H20 M4 12 H20 M4 20 H20 M4 4 V20 M12 4 V20 M20 4 V20" stroke-width="1.2"/>') },
  { id: 'Semicolon', dataKey: ';', className: 'keyboardkey semicolonKey operationButton enabledButton', transform: 'translate(-27%, 0%)', html: 'rotate <span style="font-size:30px">⥀</span>', bg: bg('<path d="M19 12 A7 7 0 1 0 12 5"/><path d="M12 5 L12 9 M12 5 L16 5"/>') },
  { id: 'Quote', dataKey: "'", className: 'keyboardkey  singleQuoteKey operationButton enabledButton', transform: 'translate(-27%, 0%)', html: 'rotate <span style="font-size:30px">⥁</span>', bg: bg('<path d="M5 12 A7 7 0 1 1 12 19"/><path d="M12 19 L12 15 M12 19 L8 19"/>') },
  { id: 'Enter', dataKey: 'return', className: 'keyboardkey returnKey OtherKey hidden', transform: 'translate(-5%, 0%)', html: 'return' },
];

const ROW4: KeyDef[] = [
  { id: 'ShiftLeft', dataKey: 'shift', className: 'keyboardkey shiftKeyLeft OtherKey hidden', html: '' },
  { id: 'KeyZ', dataKey: 'z', className: 'keyboardkey KeyZ ', transform: 'translate(38%, 0%)', html: '' },
  { id: 'KeyX', dataKey: 'x', className: 'keyboardkey xKey ', transform: 'translate(38%, 0%)', html: '' },
  { id: 'KeyC', dataKey: 'c', className: 'keyboardkey cKey stepper1Decrement enabledButton', transform: 'translate(38%, 0%)', html: '-<br />stroke<br />width', bg: bg('<path d="M4 8 H20" stroke-width="2.6"/><path d="M4 12 H14" stroke-width="1.6"/><path d="M4 16 H8" stroke-width="1"/>') },
  { id: 'KeyV', dataKey: 'v', className: 'keyboardkey vKey stepper1Increment enabledButton', transform: 'translate(38%, 0%)', html: '+<br />stroke<br />width', bg: bg('<path d="M4 8 H8" stroke-width="1"/><path d="M4 12 H14" stroke-width="1.6"/><path d="M4 16 H20" stroke-width="2.6"/>') },
  { id: 'KeyB', dataKey: 'b', className: 'keyboardkey bKey ', transform: 'translate(38%, 0%)', html: '' },
  { id: 'KeyN', dataKey: 'n', className: 'keyboardkey nKey drawingButton enabledButton circleButton', transform: 'translate(38%, 0%)', html: 'Circle<br/>by diameter', bg: bg('<circle cx="12" cy="12" r="8"/><path d="M4 12 H20"/>') },
  { id: 'KeyM', dataKey: 'm', className: 'keyboardkey mKey drawingButton enabledButton circleButton', transform: 'translate(38%, 0%)', html: 'Circle<br/>by radius', bg: bg('<circle cx="12" cy="12" r="8"/><path d="M12 12 H20"/>') },
  { id: 'Comma', dataKey: ',', className: 'keyboardkey commaKey ', transform: 'translate(38%, 0%)', html: '' },
  { id: 'Period', dataKey: '.', className: 'keyboardkey periodKey ', transform: 'translate(38%, 0%)', html: '' },
  { id: 'Slash', dataKey: '/', className: 'keyboardkey forwardSlashKey OtherKey', transform: 'translate(38%, 0%)', html: '' },
  { id: 'ShiftRight', dataKey: 'shift', className: 'keyboardkey shiftKeyRight OtherKey hidden', transform: 'translate(15%, 0%)', html: '' },
];

function KeyButton({ def, active }: { def: KeyDef; active: boolean }) {
  return (
    <button
      tabIndex={-1}
      data-key={def.dataKey}
      id={def.id}
      className={def.className + (active ? ' active' : '')}
      style={def.transform ? { transform: def.transform } : undefined}
    >
      {def.bg && (
        <span
          className="key-bg"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: def.bg }}
        />
      )}
      <span
        className="key-label"
        dangerouslySetInnerHTML={{ __html: def.html }}
      />
    </button>
  );
}

export default function Keyboard({
  activeCode,
  showSpacebar,
}: {
  activeCode: string | null;
  showSpacebar: boolean;
}) {
  return (
    <div id="keyboardKeysContainer">
      {ROW2.map((def) => (
        <KeyButton key={def.id} def={def} active={activeCode === def.id} />
      ))}
      {ROW3.map((def) => (
        <KeyButton key={def.id} def={def} active={activeCode === def.id} />
      ))}
      {ROW4.map((def) => (
        <KeyButton key={def.id} def={def} active={activeCode === def.id} />
      ))}
      {showSpacebar && (
        <button
          tabIndex={-1}
          data-key="spacebar"
          id="Space"
          className="keyboardkey spacebarKey OtherKey enabledButton selectionButton"
        >
          <span
            className="key-bg"
            aria-hidden="true"
            dangerouslySetInnerHTML={{
              __html: bg('<path d="M12 4 V20 M4 12 H20 M12 4 L9 7 M12 4 L15 7 M12 20 L9 17 M12 20 L15 17 M4 12 L7 9 M4 12 L7 15 M20 12 L17 9 M20 12 L17 15"/>'),
            }}
          />
          <span className="key-label">Drag Lock</span>
        </button>
      )}
    </div>
  );
}
