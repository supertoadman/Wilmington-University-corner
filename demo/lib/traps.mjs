// Sorts wrong answer choices into the doctrinal traps students fall into. Each wrong choice is
// scored against eight families of cue words in its rationale and text; the family with the most
// distinct cues wins, and a choice with no cue is an "incomplete rule element".

export const TRAPS = {
  CL_VS_UCC: 'Common Law vs. Statutory Rule',
  MERCHANT_THRESHOLD: 'Merchant vs. Consumer Threshold',
  HEARSAY_EXEMPTION_LAYER: 'Hearsay Layer / Confrontation Trap',
  JURISDICTION_PROCEDURAL: 'Jurisdictional Carve-Out Miss',
  REMEDY_DAMAGES_LIMIT: 'Remedy / Damages Formula Trap',
  TIMING_OR_NOTICE: 'Deadline / Seasonable Notice Trap',
  BURDEN_OR_SCRUTINY: 'Wrong Scrutiny / Burden Standard',
  ELEMENT_BOUNDARY_MISS: 'Incomplete Rule Element Trap',
};

// Tie-break order when two families score the same.
const ORDER = ['HEARSAY_EXEMPTION_LAYER', 'BURDEN_OR_SCRUTINY', 'JURISDICTION_PROCEDURAL', 'TIMING_OR_NOTICE', 'REMEDY_DAMAGES_LIMIT', 'CL_VS_UCC', 'MERCHANT_THRESHOLD'];

const CUES = {
  CL_VS_UCC: [
    /common[- ]law/i, /restatement/i, /mirror[- ]image/i, /\b(?:ucc|code) (?:does not|doesn['’]t|would not) (?:apply|govern)/i,
    /\barticle 2\b.*\b(?:not|never)\b|\b(?:not|never)\b.*\barticle 2\b/i, /predominant (?:purpose|factor|thrust)/i, /\bservices? (?:contract|predominate)/i,
    /\bnot (?:a )?(?:sale of )?goods\b/i, /\bgoverned by the (?:common law|ucc|code)\b/i, /\bstatut(?:e|ory) (?:displaces|replaces|overrides)\b/i,
    /\bpreexisting duty\b/i, /\bconsideration is (?:required|needed|lacking)\b/i, /\bseal\b/i, /\bfirm offer\b/i, /\bknock[- ]?out\b/i,
    /\bunder the (?:ucc|code|statute|act|rules?|model)\b/i, /\b[129]-\d{3}\b/, /\bstatutory\b/i, /\b(?:rupa|upa|ulpa|mbca|mrpc|model (?:code|rules))\b/i,
    /\bdefault rule\b/i, /\bgap[- ]filler\b/i, /\bparties (?:may|can) (?:vary|agree|contract)\b/i, /\bthe (?:old|former) (?:rule|law)\b/i,
  ],
  MERCHANT_THRESHOLD: [
    /\bmerchant/i, /\bconsumer/i, /\bnon-?merchant/i, /\bbetween merchants\b/i, /\$\s?500\b/, /\$\s?5,?000\b/, /\bdollar (?:amount|threshold)/i,
    /\bprofessional\b.*\b(?:held to|standard)\b/i, /\bone[- ]time seller\b/i, /\bcasual (?:seller|sale)\b/i, /\bunsophisticated\b/i, /\bnoncommercial\b/i,
    /\bindependent contractor\b/i, /\bemployee\b/i, /\bservant\b/i, /\bminor\b/i, /\bamount\b/i, /\bquantity\b/i, /\bmore than \$|\bat least \$|\bunder \$|\bover \$/i,
    /\b(?:buyer|seller|lessor|lessee|principal|agent|partner|client|lawyer) (?:is|was|qualifies as|must be) a\b/i, /\bstatus\b/i, /\bcapacity\b/i, /\bin the business\b/i,
  ],
  HEARSAY_EXEMPTION_LAYER: [
    /hearsay/i, /confrontation/i, /crawford/i, /testimonial/i, /\b(?:rule|fre) ?80[1-7]\b/i, /\bdeclarant\b/i, /\bout[- ]of[- ]court\b/i,
    /\bnon-?hearsay\b/i, /\bexcited utterance\b/i, /\bpresent sense\b/i, /\bparty[- ]opponent\b/i, /\bbusiness records?\b/i, /\bstatement against interest\b/i,
    /\bprior (?:inconsistent|consistent) statement\b/i, /\bresidual exception\b/i, /\bdying declaration\b/i,
    /\bwitness\b/i, /\btestif/i, /\bobjection\b/i, /\binadmissible\b/i, /\bexclu/i, /\bimpeach/i, /\bfoundation\b/i, /\bauthenticat/i, /\bcharacter\b/i, /\bopinion\b/i,
  ],
  JURISDICTION_PROCEDURAL: [
    /jurisdiction/i, /\bvenue\b/i, /\bdiversity\b/i, /\bfederal question\b/i, /\bsupplemental\b/i, /\bremov(?:al|e)\b/i, /\berie\b/i, /\blong[- ]arm\b/i,
    /\bservice of process\b/i, /\bamount in controversy\b/i, /\bclaim preclusion\b|\bissue preclusion\b|\bres judicata\b|\bcollateral estoppel\b/i, /\bjoinder\b/i,
    /\bclass action\b/i, /\brule 1[1-9]\b|\brule [2-9]\d\b/i, /\bpersonal jurisdiction\b/i, /\bstanding\b/i, /\bripeness\b|\bmootness\b/i, /\bstate action\b/i,
    /\bincorporat/i, /\bactual authority\b/i, /\bapparent authority\b/i,
    /\bmotion\b/i, /\bfederal court\b|\bstate court\b/i, /\bpleading\b/i, /\bdismiss/i, /\bcomplaint\b/i, /\bfederal (?:law|government)\b|\bstate law\b/i, /\bpreempt/i,
    /\bsovereign\b|\beleventh amendment\b/i, /\bcontrolling (?:law|authority)\b/i, /\bdiscipline\b|\bdisciplinary\b/i, /\bjudicial\b/i, /\bbar (?:rules|association|authorities)\b/i,
    /\bcarve[- ]out\b/i, /\bexception applies\b/i, /\bdoes not extend\b/i, /\bauthority\b/i, /\bscope of (?:employment|authority)\b/i, /\bratif/i,
  ],
  REMEDY_DAMAGES_LIMIT: [
    /\bdamages\b/i, /\bremed(?:y|ies)\b/i, /\bcover\b/i, /\bresale\b/i, /\bspecific performance\b/i, /\bconsequential\b/i, /\bincidental\b/i,
    /\bliquidated\b/i, /\bexpectation\b/i, /\breliance\b/i, /\brestitution\b/i, /\binjunct/i, /\bmarket (?:price|value)\b/i, /\bdifference between\b/i,
    /\bessential purpose\b/i, /\bcure\b/i, /\brejection\b/i, /\brevoke(?:s|d)? acceptance\b/i, /\bdisgorge/i, /\bprofits?\b.*\b(?:account|remedy)\b/i, /\bindemn/i,
    /\brecover/i, /\bsanction/i, /\battorney['’]?s? fees\b/i, /\bcompensat/i, /\bliable\b/i, /\bliability\b/i, /\bwinding up\b/i, /\baccounting\b/i, /\brescission\b/i,
    /\bloss(?:es)?\b/i, /\bsue[sd]?\b/i, /\bpay(?:s|ment)? (?:the|for)\b/i, /\bprice\b/i, /\bwarrant(?:y|ies)\b/i,
  ],
  TIMING_OR_NOTICE: [
    /\btimely\b/i, /\bdeadline/i, /\breasonable time\b/i, /\bseasonabl/i, /\bnotice\b/i, /\bnotif(?:y|ies|ied|ication)\b/i, /\bwithin \d+ (?:days|hours|months|years)\b/i,
    /\btoo late\b/i, /\bstatute of limitations\b/i, /\bwaiting period\b/i, /\bpromptly\b/i, /\bafter the (?:deadline|period)\b/i, /\bwaive[sd]?\b.*\b(?:failing|failure|did not)\b/i,
    /\bopportunity to inspect\b/i, /\bwithin a reasonable\b/i, /\bbefore (?:trial|the deadline|acceptance)\b/i,
    /\bdelay/i, /\bwithdr[ae]w/i, /\brevo(?:ke|cation)/i, /\bterminat/i, /\bexpire/i, /\bdissol/i, /\bearly\b|\blate\b/i,
    /\bafter (?:the|a|an) (?:\w+ ){0,3}(?:accept|offer|delivery|breach|death|filing|trial|dissolution)/i,
    /\bbefore (?:the|a) (?:\w+ ){0,3}(?:accept|offer|delivery|breach|death|filing|dissolution)/i, /\b(?:one|two|three|six|ten|thirty) (?:days|months|years)\b/i, /\bprior to\b/i,
  ],
  BURDEN_OR_SCRUTINY: [
    /strict scrutiny/i, /intermediate scrutiny/i, /rational[- ]basis/i, /\bburden\b/i, /\bscrutiny\b/i, /\bcompelling\b/i, /\bnarrowly tailored\b/i,
    /\bleast restrictive\b/i, /\bsubstantial(?:ly)? (?:relat|interest)/i, /\bpresum(?:ption|ed|es)\b/i, /\bpreponderance\b/i, /\bclear and convincing\b/i,
    /\bbeyond a reasonable doubt\b/i, /\bprior restraint\b/i, /\bcontent[- ](?:based|neutral)\b/i, /\bviewpoint\b/i, /\bpublic forum\b/i, /\boverbreadth\b|\bvagueness\b/i,
    /\bstandard of (?:proof|review)\b/i, /\bfiduciar/i, /\bconflict of interest\b/i, /\binformed consent\b/i,
    /\bstandard\b/i, /\btest\b/i, /\bbalanc/i, /\bheightened\b/i, /\bmust (?:show|prove|establish|demonstrate)\b/i, /\bproof\b/i, /\bprejudic/i, /\bprobative\b/i,
    /\breasonabl[ey]\b/i, /\bdiscretion/i, /\bduty of (?:loyalty|care)\b/i, /\bgood faith\b/i, /\bunconscionab/i, /\bmaterial(?:ly)?\b/i, /\bsubstantial/i, /\bprivilege/i,
  ],
};

// Families that make no sense in a subject are skipped (hearsay cues only count in Evidence, and so on).
const ONLY = {
  HEARSAY_EXEMPTION_LAYER: new Set(['evidence']),
  MERCHANT_THRESHOLD: new Set(['sales-and-leases', 'contracts-i', 'agency-and-partnership', 'professional-responsibility']),
  CL_VS_UCC: new Set(['sales-and-leases', 'contracts-i', 'agency-and-partnership', 'professional-responsibility', 'evidence']),
};

/** The trap a wrong choice falls into: { code, label }. `subjectId` limits the families to ones that fit the subject. */
export function classifyTrap(text, subjectId) {
  let best = 'ELEMENT_BOUNDARY_MISS', bestScore = 0;
  for (const code of ORDER) {
    if (subjectId && ONLY[code] && !ONLY[code].has(subjectId)) continue;
    let score = 0;
    for (const re of CUES[code]) if (re.test(text)) score++;
    if (score > bestScore) { best = code; bestScore = score; }
  }
  return { code: best, label: TRAPS[best] };
}
