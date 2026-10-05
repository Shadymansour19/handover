// row-menu__dropdown (records.css) always opened downward from its
// trigger — fine for most rows, but the last row on a page (or any row
// near the bottom of the viewport) could open mostly or entirely off
// the bottom of the screen, with nothing below it to scroll to. Call
// this right after making a dropdown visible (not before — it measures
// actual rendered height) to flip it upward instead when there isn't
// enough room below but there IS more room above.
export function positionDropdownToFit(trigger, dropdown) {
  const triggerRect = trigger.getBoundingClientRect()
  const spaceBelow = window.innerHeight - triggerRect.bottom
  const spaceAbove = triggerRect.top

  const opensUpward = dropdown.scrollHeight > spaceBelow && spaceAbove > spaceBelow
  dropdown.classList.toggle('row-menu__dropdown--up', opensUpward)
}
