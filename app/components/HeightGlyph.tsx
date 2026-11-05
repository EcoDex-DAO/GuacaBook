export default function HeightGlyph({elevation}:{elevation:number|null}) {
  const y=elevation===null?22:elevation>0?0:elevation<0?72:22;
  return <svg viewBox="0 0 140 110" className="height-glyph" aria-hidden="true">
    <rect x="1" y="1" width="138" height="108" rx="9" fill="#edf2e8"/>
    <path d="M76 99H125" stroke="#a9bbb0" strokeWidth="3"/>
    <path d="M98 73L101 100L109 72" fill="#277c8f"/>
    <ellipse cx="100" cy="67" rx="18" ry="27" fill="#268994"/>
    <ellipse cx="96" cy="67" rx="10" ry="22" fill="#e7bd51"/>
    <ellipse cx="100" cy="36" rx="18" ry="19" fill="#48a68b"/>
    <ellipse cx="88" cy="36" rx="8" ry="10" fill="#f9f2db"/>
    <circle cx="87" cy="34" r="3" fill="#203e33"/>
    <path d="M81 36Q68 34 75 49L83 44" fill="#25373a"/>
    {elevation!==null&&<>
      <path d={`M44 ${y+14}L73 36`} stroke="#bb632f" strokeWidth="2.5" strokeDasharray="4 3"/>
      <path d="M63 35L74 35L70 45" fill="none" stroke="#bb632f" strokeWidth="2.5"/>
    </>}
    <g transform={`translate(10 ${y})`}>
      <rect x="3" y="4" width="32" height="21" rx="4" fill="#244e43"/>
      <path d="M9 4L13 0H23L27 4" fill="#244e43"/>
      <circle cx="19" cy="14" r="7" fill="#dce9e0"/>
      <circle cx="19" cy="14" r="4" fill="#438b8c"/>
    </g>
    {elevation===null&&<text x="55" y="32" fill="#bb632f" fontSize="32" fontWeight="bold">?</text>}
  </svg>;
}
