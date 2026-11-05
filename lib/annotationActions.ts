import type {Box,Photo} from "./dataset";
export function showPeriocularRegion(photo:Photo,side:Box["side"]):Partial<Photo> {
  const previous=photo.regionBySide?.[side]??(photo.eyeLayout==="both"?undefined:photo.regionVisible);
  const visibility=previous==="partial"?"partial":"yes";
  return {regionBySide:{...photo.regionBySide,[side]:visibility},regionVisible:photo.eyeLayout==="both"?undefined:visibility};
}
export function showAnnotationFrame(photo:Photo,category:Box["category"],side:Box["side"]):Partial<Photo> {
  if(category==="macaw")return {bodyVisibility:photo.bodyVisibility==="partial"?"partial":"full"};
  if(category==="eye")return {eyeVisible:"yes",eyeLayout:photo.eyeVisible==="yes"&&photo.eyeLayout?photo.eyeLayout:side};
  return showPeriocularRegion(photo,side);
}
export function resetAnnotationFrames(photo:Photo,category:Box["category"],side?:Box["side"]):Partial<Photo> {
  const boxes=photo.boxes.filter(box=>!(box.category===category&&box.birdId===(photo.birdId||"")&&(side===undefined||box.side===side)));
  if(category==="macaw")return {boxes,bodyVisibility:undefined};
  if(category==="eye") {
    const dependent=resetAnnotationFrames({...photo,boxes},"periocular_region",side);
    return {...dependent,...(side===undefined?{eyeVisible:undefined,eyeLayout:undefined}:{})};
  }
  const regions={...photo.regionBySide};
  if(side!==undefined)delete regions[side];
  return {boxes,regionVisible:undefined,regionBySide:side!==undefined&&Object.keys(regions).length?regions:undefined};
}

export function regionSharpness(value:NonNullable<Box["sharpness"]>):Partial<Box> {
  return {sharpness:value,usability:value==="sharp"?"usable":value==="unknown"?"unknown":"unusable"};
}
export function hidePeriocularRegion(photo:Photo,side:Box["side"]):Partial<Photo> {
  return {...resetAnnotationFrames(photo,"periocular_region",side),
    regionBySide:{...photo.regionBySide,[side]:"no"},
    regionVisible:photo.eyeLayout==="both"?undefined:"no"};
}
