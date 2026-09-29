// On-screen keyboard: display-only key indicators (no click behavior,
// mirroring the original). Highlight follows physical key activity.
interface KeyDef {
  id: string;
  dataKey: string;
  className: string;
  transform?: string;
  html: string;
}

const ROW2: KeyDef[] = [
  { id: 'Tab', dataKey: 'tab', className: 'keyboardkey tabKey OtherKey enabledButton', html: 'Select Objects' },
  { id: 'KeyQ', dataKey: 'q', className: 'keyboardkey KeyQ operationButton enabledButton cancelButton', transform: 'translate(-45%, 0%)', html: 'cancel' },
  { id: 'KeyW', dataKey: 'w', className: 'keyboardkey wKey operationButton enabledButton', html: 'stamp' },
  { id: 'KeyE', dataKey: 'e', className: 'keyboardkey eKey ', html: '' },
  { id: 'KeyR', dataKey: 'r', className: 'keyboardkey rKey ', transform: 'translate(-45%, 0%)', html: '' },
  { id: 'KeyT', dataKey: 't', className: 'keyboardkey tKey ', transform: 'translate(-45%, 0%)', html: '' },
  { id: 'KeyY', dataKey: 'y', className: 'keyboardkey yKey drawingButton enabledButton rectangleButton', transform: 'translate(-45%, 0%)', html: 'Rect.<br/>by centerline' },
  { id: 'KeyU', dataKey: 'u', className: 'keyboardkey uKey drawingButton enabledButton rectangleButton', transform: 'translate(-45%, 0%)', html: 'Rect.<br/>by 2 edges' },
  { id: 'KeyI', dataKey: 'i', className: 'keyboardkey iKey drawingButton enabledButton rectangleButton', transform: 'translate(-47%, 0%)', html: 'Rect.<br/>by diag.' },
  { id: 'KeyO', dataKey: 'o', className: 'keyboardkey oKey drawingButton enabledButton quadButton', transform: 'translate(-45%, 0%)', html: 'Quad<br/>4 pts' },
  { id: 'KeyP', dataKey: 'p', className: 'keyboardkey pKey ', html: '' },
  { id: 'BracketLeft', dataKey: '[', className: 'keyboardkey  bracketLeftKey operationButton enabledButton', html: 'scale -' },
  { id: 'BracketRight', dataKey: ']', className: 'keyboardkey  bracketRightKey operationButton enabledButton', html: 'scale +' },
  { id: 'Backslash', dataKey: '\\', className: 'keyboardkey  backslashKey', html: '' },
];

const ROW3: KeyDef[] = [
  { id: 'CapsLock', dataKey: 'capslock', className: 'keyboardkey capsLockKey OtherKey hidden', html: '' },
  { id: 'KeyA', dataKey: 'a', className: 'keyboardkey KeyA endButton', transform: 'translate(-27%, 0%)', html: '<b>END</b><br />' },
  { id: 'KeyS', dataKey: 's', className: 'keyboardkey sKey toggleButton enabledButton', transform: 'translate(-27%, 0%)', html: 'toggle<br/>stroke' },
  { id: 'KeyD', dataKey: 'd', className: 'keyboardkey dKey toggleButton enabledButton', transform: 'translate(-27%, 0%)', html: 'toggle<br/>fill' },
  { id: 'KeyF', dataKey: 'f', className: 'keyboardkey fKey drawingButton', transform: 'translate(-27%, 0%)', html: 'sharp</br>point' },
  { id: 'KeyG', dataKey: 'g', className: 'keyboardkey gKey drawingButton enabledButton', transform: 'translate(-27%, 0%)', html: 'spline<br/>point' },
  { id: 'KeyH', dataKey: 'h', className: 'keyboardkey hKey ', transform: 'translate(-27%, 0%)', html: '' },
  { id: 'KeyJ', dataKey: 'j', className: 'keyboardkey jKey ', transform: 'translate(-27%, 0%)', html: '' },
  { id: 'KeyK', dataKey: 'k', className: 'keyboardkey kKey ', transform: 'translate(-27%, 0%)', html: '' },
  { id: 'KeyL', dataKey: 'l', className: 'keyboardkey lKey ', transform: 'translate(-27%, 0%)', html: 'Grid<br/>Toggle' },
  { id: 'Semicolon', dataKey: ';', className: 'keyboardkey semicolonKey operationButton enabledButton', transform: 'translate(-27%, 0%)', html: 'rotate <span style="font-size:30px">⥀</span>' },
  { id: 'Quote', dataKey: "'", className: 'keyboardkey  singleQuoteKey operationButton enabledButton', transform: 'translate(-27%, 0%)', html: 'rotate <span style="font-size:30px">⥁</span>' },
  { id: 'Enter', dataKey: 'return', className: 'keyboardkey returnKey OtherKey hidden', transform: 'translate(-5%, 0%)', html: 'return' },
];

const ROW4: KeyDef[] = [
  { id: 'ShiftLeft', dataKey: 'shift', className: 'keyboardkey shiftKeyLeft OtherKey hidden', html: '' },
  { id: 'KeyZ', dataKey: 'z', className: 'keyboardkey KeyZ ', transform: 'translate(38%, 0%)', html: '' },
  { id: 'KeyX', dataKey: 'x', className: 'keyboardkey xKey ', transform: 'translate(38%, 0%)', html: '' },
  { id: 'KeyC', dataKey: 'c', className: 'keyboardkey cKey stepper1Decrement enabledButton', transform: 'translate(38%, 0%)', html: '-<br />stroke<br />width' },
  { id: 'KeyV', dataKey: 'v', className: 'keyboardkey vKey stepper1Increment enabledButton', transform: 'translate(38%, 0%)', html: '+<br />stroke<br />width' },
  { id: 'KeyB', dataKey: 'b', className: 'keyboardkey bKey ', transform: 'translate(38%, 0%)', html: '' },
  { id: 'KeyN', dataKey: 'n', className: 'keyboardkey nKey drawingButton enabledButton circleButton', transform: 'translate(38%, 0%)', html: 'Circle<br/>by diameter' },
  { id: 'KeyM', dataKey: 'm', className: 'keyboardkey mKey drawingButton enabledButton circleButton', transform: 'translate(38%, 0%)', html: 'Circle<br/>by radius' },
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
      dangerouslySetInnerHTML={{ __html: def.html }}
    />
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
          dangerouslySetInnerHTML={{ __html: 'Drag Lock' }}
        />
      )}
    </div>
  );
}
