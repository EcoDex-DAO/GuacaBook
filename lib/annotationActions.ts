import type {Box,Photo} from "./dataset";
export function showPeriocularRegion(photo:Photo,side:Box["side"]):Partial<Photo> {
  const previous=photo.regionBySide?.[side]??(photo.eyeLayout==="both"?undefined:photo.regionVisible);
  const visibility=previous==="partial"?"partial":"yes";
  return {regionBySide:{...photo.regionBySide,[side]:visibility},regionVisible:photo.eyeLayout==="both"?undefined:visibility};
}
export function resetAnnotationFrames(photo:Photo,category:Box["category"],side?:Box["side"]):Partial<Photo> {
  const boxes=photo.boxes.filter(box=>!(box.category===category&&box.birdId===(photo.birdId||"")&&(side===undefined||box.side===side)));
  if(category!=="periocular_region")return {boxes};
  const regions={...photo.regionBySide};
  if(side!==undefined)delete regions[side];
  return {boxes,regionVisible:undefined,regionBySide:side!==undefined&&Object.keys(regions).length?regions:undefined};
}
