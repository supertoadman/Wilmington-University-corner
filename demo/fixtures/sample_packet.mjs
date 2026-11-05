// The two showcase packets for the compiler (Showcase Mode, $0, offline).
//
// Each packet is what a compile of a professor's pasted notes would produce: a master rule graph,
// a student outline in the library site's structured markup, six bar questions (three base, three
// one-fact variations) and the table of authorities the deterministic citation verifier checks
// against. Authorities are paraphrased from the official texts (MBCA as revised in 2016 numbering,
// the DGCL, the UCC official text, the Restatement (Second) of Contracts). Confirm against the
// current code before classroom use; the UI says so.
//
// Rule of the house: every statute, rule, restatement or case cite that appears in a node, the
// outline or a question must have an entry in that packet's `authorities`.

const slug = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Escape, then allow **bold** and *italic* in outline prose. */
const t = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');

// ---- outline markup helpers (same classes the site's structured outlines use) -------------------
const masthead = (title, subtitle, meta = []) => `<header class="doc-masthead"><h1 class="doc-title">${t(title)}</h1><p class="doc-subtitle">${t(subtitle)}</p>${meta.map((m) => `<p class="doc-meta">${t(m)}</p>`).join('')}</header>`;
const band = (id, title, chip) => `<div class="section-band"><h2 id="${id}">${t(title)}</h2>${chip ? `<span class="section-week">${t(chip)}</span>` : ''}</div>`;
const h3 = (id, title) => `<h3 id="${id}">${t(title)}</h3>`;
const p = (s) => `<p>${t(s)}</p>`;
const elements = (items) => items.map((x, i) => `<p><span class="el el-${(i % 6) + 1}">(${i + 1}) ${t(x)}</span></p>`).join('');
const callout = (kind, tag, title, body) => `<aside class="callout callout-${kind}"><span class="callout-tag">${tag}</span>${title ? `<p class="callout-title">${t(title)}</p>` : ''}${body}</aside>`;
const rule = (title, items, lead, after) => callout('rule', 'rule', title, `${lead ? p(lead) : ''}${elements(items)}${after ? p(after) : ''}`);
const roadmap = (title, items) => callout('roadmap', 'roadmap', title, elements(items));
const trap = (title, body) => callout('tips', 'trap', title, p(body));
const caseCard = ({ tag, name, facts, held, why }) => `<aside class="callout callout-case case-${tag.startsWith('main') ? 'main' : tag.startsWith('note') ? 'note' : 'cited'}"><span class="callout-tag">${t(tag)}</span><p class="callout-title">${t(name)}</p>`
  + `<p class="case-field case-facts"><strong class="case-label">Facts:</strong> ${t(facts)}</p>`
  + `<p class="case-field case-held"><strong class="case-label">Held:</strong> ${t(held)}</p>`
  + `<p class="case-field case-why"><strong class="case-label">Why it matters:</strong> ${t(why)}</p></aside>`;
const table = (head, rows) => `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${t(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr class="rb rb-${(i % 6) + 1}">${r.map((c, j) => `<td data-label="${esc(head[j]).replace(/"/g, '&quot;')}">${t(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

/** A choice: wrong ones carry a trap code. */
const ok = (text, rationale) => ({ text, rationale, is_correct: true });
const no = (trap_code, text, rationale) => ({ text, rationale, is_correct: false, trap_code });

// =================================================================================================
// PACKET 1 — Corporate Law: MBCA fundamental changes + MEE overlay
// =================================================================================================

const corpMaterial = `BUSINESS ORGANIZATIONS - UNIT 6: FUNDAMENTAL CORPORATE CHANGES
Lecture notes with exam flags (MBCA as revised; Delaware for contrast)

1. WHY THESE TRANSACTIONS ARE "FUNDAMENTAL"
Day-to-day decisions belong to the board. A short list of transactions changes what shareholders actually own, so the statute adds a shareholder vote and, sometimes, a right to be cashed out. Think in three beats: the board adopts, the shareholders approve, and dissenters may demand fair value.

2. MERGER AND SHARE EXCHANGE (MBCA §§ 11.02–11.04)
A merger absorbs one corporation into another, or combines two into a new one, under a plan of merger. The consideration need not be stock: cash or other property works (MBCA § 11.02), which is why cash-out and triangular mergers exist. The survivor succeeds to all rights and liabilities by operation of law (MBCA § 11.07).
In a share exchange the acquirer takes all the shares of one or more classes of the target from its shareholders under a plan of share exchange (MBCA § 11.03). The target survives as a subsidiary; no assets move.
Process (MBCA § 11.04): the board of each corporation party to a merger, and of the corporation whose shares are acquired in a share exchange, adopts the plan and submits it to its shareholders. Approval requires a majority of all the votes entitled to be cast by each voting group (MBCA § 11.04(e)): a majority of the shares OUTSTANDING, not a majority of those voting. The articles may require more.
Who does not vote: the acquirer's shareholders in a share exchange; the survivor's shareholders in a merger if their shares and the articles are unchanged and the deal adds no more than 20 percent new voting shares (MBCA § 11.04; compare DGCL § 251(f)). Delaware also requires a majority of the outstanding stock of each constituent corporation (DGCL § 251(c)).
Triangular mergers: the acquirer forms a subsidiary and the subsidiary merges with the target. The acquirer is not a party, so its shareholders do not vote. In a reverse triangular merger the target survives, so its contracts and permits stay in place.
Short-form merger (MBCA § 11.05): a parent holding at least 90 percent of the subsidiary's voting shares merges the subsidiary into itself with no subsidiary vote. Minority holders keep appraisal. Delaware: DGCL § 253 (90 percent of each class); appraisal under DGCL § 262.

3. SALE OF SUBSTANTIALLY ALL ASSETS (MBCA §§ 12.01–12.02)
No vote for ordinary-course sales, mortgages, or transfers to a wholly owned subsidiary (MBCA § 12.01). A sale outside the ordinary course needs a shareholder vote only if it would leave the corporation without a significant continuing business activity (MBCA § 12.02(a)). Safe harbor: keep a business that is at least 25 percent of total assets AND at least 25 percent of pre-tax income or revenues from continuing operations, and you are conclusively treated as keeping a significant continuing business activity. Vote: the board proposes; a majority of all votes entitled to be cast approves; only the SELLER's shareholders vote (MBCA § 12.02).
Delaware: DGCL § 271 asks whether the sale is of all or substantially all assets, a judgment about quantity and quality with no 25 percent safe harbor; Katz v. Bregman treated the sale of a business unit of about half the company's assets as substantially all. No appraisal on an asset sale in Delaware unless the charter provides (DGCL § 262), because Hariton v. Arco Electronics, Inc. treats the merger and asset-sale statutes as independent routes; Pennsylvania took the de facto merger view in Farris v. Glen Alden Corp. Under the MBCA, a shareholder entitled to vote on a § 12.02 sale does get appraisal (MBCA § 13.02(a)).

4. APPRAISAL (MBCA ch. 13)
Triggers (MBCA § 13.02(a)): a merger on which the shareholder votes, a merger of a subsidiary under § 11.05, a share exchange on which the shareholder votes, and an asset sale requiring a vote. Market-out (MBCA § 13.02(b)): none for listed or widely held and large shares, unless the transaction is an interested transaction. Delaware's market-out disappears if holders must take cash or unlisted securities (DGCL § 262).
Procedure: written notice of intent to demand payment BEFORE the vote, and do not vote those shares in favor (MBCA § 13.21). Fair value is the value immediately before the action, excluding value created in anticipation of it, with no discount for minority status or lack of marketability (MBCA § 13.01). Disputes go to court (MBCA § 13.30). In Delaware, fair value takes in all relevant factors (Weinberger v. UOP, Inc.).

5. DISSOLUTION
Voluntary (MBCA § 14.02): the board proposes; shareholders approve by a majority of all votes entitled to be cast. After dissolution the corporation continues only to wind up (MBCA § 14.05).
Judicial (MBCA § 14.30(a)(2)): on a shareholder petition if directors are deadlocked, those in control act in a manner that is illegal, oppressive or fraudulent, shareholders are deadlocked through two annual meetings, or assets are misapplied or wasted. The corporation can avoid dissolution by electing to buy the petitioner out at fair value (MBCA § 14.34).

6. MEE FLAGS
Order of attack: identify the transaction and the corporations; board action; who votes and by what measure; exceptions (short-form, 20 percent, 25 percent); dissenters' rights and procedure; Delaware contrast if the question says Delaware. The examiners love the shareholder who "voted no" but never gave notice.`;

const corpAuthorities = [
  { cite: 'MBCA § 11.02', text: 'A plan of merger may combine corporations; the plan sets the terms and the consideration, which may be shares, cash, other securities or property.' },
  { cite: 'MBCA § 11.03', text: 'In a share exchange the acquirer takes all shares of one or more classes of the target from its shareholders under a plan of share exchange; the target survives.' },
  { cite: 'MBCA § 11.04', text: 'The board of each corporation party to a merger, and of the corporation whose shares are acquired in a share exchange, adopts the plan and submits it to its shareholders; surviving-corporation shareholders do not vote if articles and shares are unchanged and new voting shares do not exceed 20 percent.' },
  { cite: 'MBCA § 11.04(e)', text: 'Approval requires a majority of all the votes entitled to be cast on the plan by each voting group entitled to vote separately, unless the articles or the board require more.' },
  { cite: 'MBCA § 11.05', text: 'A parent that owns shares carrying at least 90 percent of the voting power of each class and series of the subsidiary’s outstanding voting shares may merge the subsidiary into itself or another subsidiary without approval by the subsidiary’s board or shareholders.' },
  { cite: 'MBCA § 11.07', text: 'On a merger, the survivor succeeds to all rights and liabilities of each merged corporation, and title to property vests in it without reversion or impairment.' },
  { cite: 'MBCA § 12.01', text: 'No shareholder approval is needed for a sale in the usual and regular course of business, a mortgage or pledge, a transfer to a wholly owned subsidiary, or a pro rata distribution to shareholders.' },
  { cite: 'MBCA § 12.02', text: 'A disposition of assets that requires shareholder approval under § 12.02(a) is adopted by the board and submitted to the shareholders, and is approved by a majority of all the votes entitled to be cast on it unless the articles or the board require more; only the selling corporation’s shareholders vote.' },
  { cite: 'MBCA § 12.02(a)', text: 'Shareholder approval is required if the disposition would leave the corporation without a significant continuing business activity; keeping a business with at least 25 percent of total assets and 25 percent of income or revenues from continuing operations conclusively satisfies the test.' },
  { cite: 'MBCA § 13.01', text: 'Fair value is the value immediately before the action, excluding appreciation or depreciation in anticipation of it unless inequitable, without discounting for lack of marketability or minority status.' },
  { cite: 'MBCA § 13.02(a)', text: 'Appraisal rights attach to, among other listed actions, a merger for which the shareholder is entitled to vote, a short-form merger of a subsidiary under § 11.05 (for the subsidiary’s shareholders), a share exchange in which the corporation’s shares are acquired if the shareholder is entitled to vote, and a disposition of assets that requires a vote under § 12.02.' },
  { cite: 'MBCA § 13.02(b)', text: 'Market-out: no appraisal for shares that are covered securities or traded in an organized market with enough holders and value, except in an interested transaction.' },
  { cite: 'MBCA § 13.21', text: 'A shareholder who wants appraisal must deliver written notice of intent to demand payment before the vote is taken and must not vote those shares in favor of the action.' },
  { cite: 'MBCA § 13.30', text: 'Court action: if the demand remains unsettled the corporation commences a proceeding and the court determines the fair value of the shares.' },
  { cite: 'MBCA § 14.02', text: 'Dissolution by the board and shareholders: the board proposes and recommends; shareholders approve by a majority of all votes entitled to be cast unless a greater vote is required.' },
  { cite: 'MBCA § 14.05', text: 'A dissolved corporation continues its existence but may carry on only business appropriate to wind up and liquidate.' },
  { cite: 'MBCA § 14.30(a)(2)', text: 'On a shareholder petition a court may dissolve a corporation for director deadlock with irreparable injury, illegal, oppressive or fraudulent conduct by those in control, shareholder deadlock through two annual meetings, or misapplied or wasted assets.' },
  { cite: 'MBCA § 14.34', text: 'In a judicial dissolution proceeding the corporation, or other shareholders, may elect to purchase the petitioner’s shares at fair value instead of dissolution.' },
  { cite: 'DGCL § 251(c)', text: 'A merger agreement is adopted if a majority of the outstanding stock entitled to vote of each constituent corporation votes for it.' },
  { cite: 'DGCL § 251(f)', text: 'No vote of the surviving corporation’s stockholders is needed if its charter is unchanged, each share is unchanged, and shares issued do not exceed 20 percent of those outstanding.' },
  { cite: 'DGCL § 253', text: 'A parent owning at least 90 percent of the outstanding shares of each class of a subsidiary may merge it into itself without a stockholder vote.' },
  { cite: 'DGCL § 262', text: 'Appraisal applies to mergers and consolidations, with a market-out for listed or widely held stock unless holders must accept cash or unlisted securities; a charter may extend appraisal to asset sales; the court considers all relevant factors.' },
  { cite: 'DGCL § 271', text: 'A sale of all or substantially all assets requires board approval and a majority of the outstanding stock entitled to vote.' },
  { cite: 'Hariton v. Arco Electronics, Inc., 188 A.2d 123 (Del. 1963)', text: 'Delaware treats the merger and asset-sale statutes as independent; a sale of assets for stock followed by dissolution is not recharacterized as a merger to create appraisal rights.' },
  { cite: 'Farris v. Glen Alden Corp., 143 A.2d 25 (Pa. 1958)', text: 'Pennsylvania treated a combination structured as an asset sale as a de facto merger, giving dissenting shareholders appraisal rights.' },
  { cite: 'Weinberger v. UOP, Inc., 457 A.2d 701 (Del. 1983)', text: 'Cash-out mergers by a controlling shareholder are reviewed for entire fairness (fair dealing and fair price); appraisal value considers all relevant factors.' },
  { cite: 'Katz v. Bregman, 431 A.2d 1274 (Del. Ch. 1981)', text: 'Chancery treated the sale of a business unit representing about half the corporation’s assets and a large share of its sales as a sale of substantially all assets requiring a stockholder vote.' },
];

const corpNodes = [
  {
    id: 'corp.merger-mechanics', area_title: 'Merger & Share Exchange', code: 'MBCA 11.02–11.03, 11.07', title: 'Merger and share exchange: what each one is', scope: 'both',
    elements: [
      'Merger: one corporation is absorbed into another, or two combine into a new one, under a plan of merger (MBCA § 11.02).',
      'The consideration may be shares, cash, other securities or property (MBCA § 11.02), so a merger can cash out the target’s shareholders.',
      'Share exchange: the acquirer takes all shares of one or more classes of the target from its shareholders under a plan of share exchange (MBCA § 11.03); the target survives as a subsidiary and no assets change hands.',
      'Effect of a merger: the survivor succeeds to all rights and liabilities of the merged corporations by operation of law (MBCA § 11.07).',
    ],
    traps: [
      { code: 'ELEMENT_BOUNDARY_MISS', note: 'Treating a share exchange like an asset deal. The target transfers nothing, so its contracts and permits stay put.' },
      { code: 'CL_VS_UCC', note: 'Assuming the buyer must expressly assume liabilities as in an asset purchase. In a merger the survivor is liable by operation of law.' },
    ],
    statute_cites: ['MBCA § 11.02', 'MBCA § 11.03', 'MBCA § 11.07'], case_cites: [],
    bar_overlay: { tested_on: 'MEE', frequency: 'medium', note: 'Often framed as a structuring question: which form leaves liabilities behind (asset sale) and which carries them (merger).' },
    depends_on: [], anchor: 'merger-and-share-exchange',
  },
  {
    id: 'corp.vote-who-votes', area_title: 'Merger & Share Exchange', code: 'MBCA 11.04', title: 'Who votes, and what vote', scope: 'both',
    elements: [
      'The board of each corporation party to a merger, and of the corporation whose shares are acquired in a share exchange, adopts the plan and submits it to its shareholders (MBCA § 11.04).',
      'Approval takes a majority of all the votes entitled to be cast on the plan, counted by each voting group entitled to vote separately (MBCA § 11.04(e)): a majority of the shares outstanding, not of the shares voting at the meeting. The articles or the board may require more.',
      'Acquirer shareholders in a share exchange do not vote. A surviving corporation’s shareholders do not vote if its articles and their shares are unchanged and the deal adds no more than 20 percent new voting shares (MBCA § 11.04).',
      'Delaware compares: a majority of the outstanding stock entitled to vote of each constituent corporation (DGCL § 251(c)), with the same 20 percent exception for the survivor (DGCL § 251(f)).',
    ],
    traps: [
      { code: 'BURDEN_OR_SCRUTINY', note: '“Majority of the votes cast” is the wrong measure. The MBCA counts all votes entitled to be cast.' },
      { code: 'JURISDICTION_PROCEDURAL', note: 'Letting the acquirer’s shareholders vote in a share exchange. Only the target, and a survivor that breaks the 20 percent rule, vote.' },
      { code: 'CL_VS_UCC', note: 'Reciting the old two-thirds requirement. The MBCA and Delaware both use a majority of the outstanding shares.' },
    ],
    statute_cites: ['MBCA § 11.04', 'MBCA § 11.04(e)', 'DGCL § 251(c)', 'DGCL § 251(f)'], case_cites: [],
    bar_overlay: { tested_on: 'MEE', frequency: 'high', note: 'Nearly every fundamental-change essay asks who must approve and by what vote.' },
    depends_on: ['corp.merger-mechanics'], anchor: 'who-votes-and-what-vote',
  },
  {
    id: 'corp.triangular', area_title: 'Merger & Share Exchange', code: 'MBCA 11.02, 11.04', title: 'Triangular mergers and the vote', scope: 'bar_only',
    elements: [
      'Forward triangular: the target merges into the acquirer’s subsidiary, which survives. Reverse triangular: the acquirer’s subsidiary merges into the target, which survives as the acquirer’s subsidiary.',
      'The acquirer is not a party to the merger; its subsidiary is. So the acquirer’s own shareholders have no statutory merger vote, and the acquirer acts only as the subsidiary’s sole shareholder.',
      'The target’s shareholders vote as a party to the merger, by a majority of all votes entitled to be cast (MBCA § 11.04(e)), and may have appraisal rights if they are cashed out (MBCA § 13.02(a)).',
      'Reverse triangular mergers are popular because the target survives, so its contracts, permits and licenses usually stay in place without assignment, subject to any change-of-control clause (MBCA § 11.02).',
    ],
    traps: [
      { code: 'JURISDICTION_PROCEDURAL', note: 'Giving the acquirer’s shareholders a vote because the deal is large. The statute attaches the vote to the parties to the merger.' },
      { code: 'MERCHANT_THRESHOLD', note: 'Invoking the 90 percent short-form merger when the acquirer holds no, or too few, target shares.' },
    ],
    statute_cites: ['MBCA § 11.02', 'MBCA § 11.04(e)', 'MBCA § 13.02(a)'], case_cites: [],
    bar_overlay: { tested_on: 'MEE', frequency: 'medium', note: 'Tested as a “structure the deal” fact pattern: the examiner wants who votes and who gets appraisal.' },
    depends_on: ['corp.vote-who-votes'], anchor: 'triangular-mergers',
  },
  {
    id: 'corp.short-form', area_title: 'Merger & Share Exchange', code: 'MBCA 11.05', title: 'Short-form (parent-subsidiary) merger', scope: 'course',
    elements: [
      'A parent holding at least 90 percent of the subsidiary’s voting shares may merge the subsidiary into itself, or into another subsidiary (MBCA § 11.05).',
      'No vote of the subsidiary’s shareholders, and no approval by the subsidiary’s board, is needed (MBCA § 11.05).',
      'The minority is not left without a remedy: shareholders of a subsidiary merged under § 11.05 keep appraisal rights (MBCA § 13.02(a)).',
      'Delaware uses the same idea at 90 percent of each class (DGCL § 253), and the minority’s remedy is appraisal (DGCL § 262).',
    ],
    traps: [
      { code: 'MERCHANT_THRESHOLD', note: 'The threshold is 90 percent. A simple majority, two-thirds or 85 percent does not qualify.' },
      { code: 'REMEDY_DAMAGES_LIMIT', note: 'Assuming the minority is simply squeezed out. Appraisal remains.' },
    ],
    statute_cites: ['MBCA § 11.05', 'MBCA § 13.02(a)', 'DGCL § 253', 'DGCL § 262'], case_cites: [],
    bar_overlay: { tested_on: 'MEE', frequency: 'low', note: 'Usually a sub-issue inside a larger squeeze-out or parent-subsidiary fact pattern.' },
    depends_on: ['corp.merger-mechanics'], anchor: 'short-form-mergers',
  },
  {
    id: 'corp.asset-sale-test', area_title: 'Sale of Substantially All Assets', code: 'MBCA 12.01–12.02', title: 'When an asset sale needs a shareholder vote', scope: 'both',
    elements: [
      'Sales in the usual and regular course of business, mortgages and pledges, and transfers to a wholly owned subsidiary need no shareholder approval (MBCA § 12.01).',
      'A sale of all or substantially all property outside the ordinary course needs shareholder approval only if it would leave the corporation without a significant continuing business activity (MBCA § 12.02(a)).',
      'Safe harbor: a corporation that keeps a business with at least 25 percent of total assets and at least 25 percent of income or revenues from continuing operations is conclusively treated as keeping a significant continuing business activity (MBCA § 12.02(a)).',
      'Delaware has no 25 percent safe harbor. DGCL § 271 asks whether the sale is of all or substantially all assets, a judgment about quantity and quality (Katz v. Bregman).',
    ],
    traps: [
      { code: 'ELEMENT_BOUNDARY_MISS', note: 'Stopping at “outside the ordinary course” and forgetting that the MBCA vote also requires leaving the corporation without a significant continuing business.' },
      { code: 'MERCHANT_THRESHOLD', note: 'Misapplying the safe harbor. The retained business must clear both the asset prong and the income-or-revenue prong.' },
    ],
    statute_cites: ['MBCA § 12.01', 'MBCA § 12.02(a)', 'DGCL § 271'], case_cites: ['Katz v. Bregman'],
    bar_overlay: { tested_on: 'MEE', frequency: 'high', note: 'Classic MEE pairing with appraisal: does the sale need a vote and, if so, may dissenters be cashed out?' },
    depends_on: ['corp.vote-who-votes'], anchor: 'when-an-asset-sale-needs-a-vote',
  },
  {
    id: 'corp.asset-sale-vs-merger', area_title: 'Sale of Substantially All Assets', code: 'MBCA 12.02; DGCL 271', title: 'Asset sale versus merger', scope: 'both',
    elements: [
      'In an asset sale only the selling corporation’s board and shareholders act. The buyer’s shareholders have no statutory vote unless the buyer is itself merging (MBCA § 12.02).',
      'The buyer takes the assets and only the liabilities it agrees to assume, subject to the traditional exceptions: express or implied assumption, de facto merger, mere continuation and fraud.',
      'Delaware’s equal dignity (independent legal significance) rule treats the merger and asset-sale statutes as separate routes even when the economics match (Hariton v. Arco Electronics, Inc.). Pennsylvania took the de facto merger view (Farris v. Glen Alden Corp.).',
      'Under the MBCA a shareholder entitled to vote on a § 12.02 sale has appraisal rights (MBCA § 13.02(a)). Delaware gives none on an asset sale unless the charter says so (DGCL § 262; DGCL § 271).',
    ],
    traps: [
      { code: 'CL_VS_UCC', note: 'Importing the de facto merger doctrine to create appraisal rights in Delaware. Hariton rejects it, and the MBCA grants appraisal on asset sales directly.' },
      { code: 'REMEDY_DAMAGES_LIMIT', note: 'Assuming the buyer inherits all of the seller’s liabilities, as a merger survivor would.' },
    ],
    statute_cites: ['MBCA § 12.02', 'MBCA § 13.02(a)', 'DGCL § 262', 'DGCL § 271'], case_cites: ['Hariton v. Arco Electronics, Inc.', 'Farris v. Glen Alden Corp.'],
    bar_overlay: { tested_on: 'MEE', frequency: 'medium', note: 'Examiners ask you to compare the merger route and the asset-sale route for the same deal.' },
    depends_on: ['corp.asset-sale-test', 'corp.merger-mechanics'], anchor: 'asset-sale-vs-merger',
  },
  {
    id: 'corp.appraisal-triggers', area_title: 'Appraisal Rights', code: 'MBCA 13.02', title: 'Appraisal rights: when they exist', scope: 'both',
    elements: [
      'A shareholder entitled to vote on a merger has appraisal rights, as do a minority shareholder of a subsidiary merged under § 11.05 and a target shareholder entitled to vote in a share exchange (MBCA § 13.02(a)).',
      'Appraisal also attaches to a sale of substantially all assets that requires a vote under § 12.02, and to a few other actions listed there (MBCA § 13.02(a)).',
      'Market-out: no appraisal for shares that are listed on a national exchange or are widely held and large enough in an organized market, unless the transaction is an interested transaction such as a controlling-shareholder cash-out (MBCA § 13.02(b)).',
      'Delaware’s market-out disappears if holders must accept cash or unlisted securities (DGCL § 262). The MBCA’s disappears only for interested transactions (MBCA § 13.02(b)).',
    ],
    traps: [
      { code: 'REMEDY_DAMAGES_LIMIT', note: 'Treating appraisal as available for every fundamental change. It follows the vote right and is cut off by the market-out.' },
      { code: 'JURISDICTION_PROCEDURAL', note: 'Assuming Delaware gives appraisal on an asset sale. It does not unless the charter provides it.' },
    ],
    statute_cites: ['MBCA § 13.02(a)', 'MBCA § 13.02(b)', 'DGCL § 262'], case_cites: [],
    bar_overlay: { tested_on: 'MEE', frequency: 'high', note: 'Triggers and the market-out are the favorite MEE detail in this unit.' },
    depends_on: ['corp.vote-who-votes', 'corp.asset-sale-test', 'corp.short-form'], anchor: 'when-appraisal-rights-exist',
  },
  {
    id: 'corp.appraisal-procedure', area_title: 'Appraisal Rights', code: 'MBCA 13.01, 13.21, 13.30', title: 'Appraisal procedure and fair value', scope: 'both',
    elements: [
      'Before the vote, the shareholder must deliver written notice of intent to demand payment (MBCA § 13.21).',
      'The shareholder must not vote, or permit to be voted, those shares in favor of the action (MBCA § 13.21).',
      'After the action is approved, the shareholder follows the corporation’s appraisal notice: demands payment and deposits certificates by the stated date (MBCA ch. 13).',
      'Payment is the fair value of the shares immediately before the action, excluding value created or lost in anticipation of it unless that would be inequitable, with no discount for minority status or lack of marketability (MBCA § 13.01).',
      'If the shareholder and corporation cannot agree, the corporation starts a court proceeding and the court determines fair value (MBCA § 13.30).',
      'Delaware requires a written demand before the vote and no vote in favor, and the court considers all relevant factors (DGCL § 262; Weinberger v. UOP, Inc.).',
    ],
    traps: [
      { code: 'TIMING_OR_NOTICE', note: 'Notice of intent comes before the vote. A demand sent after the meeting is too late.' },
      { code: 'ELEMENT_BOUNDARY_MISS', note: 'Voting against is not enough by itself, and voting for the deal forfeits appraisal.' },
      { code: 'REMEDY_DAMAGES_LIMIT', note: 'Applying a minority or marketability discount. Fair value is a pro rata share of the going concern.' },
    ],
    statute_cites: ['MBCA § 13.01', 'MBCA § 13.21', 'MBCA § 13.30', 'DGCL § 262'], case_cites: ['Weinberger v. UOP, Inc.'],
    bar_overlay: { tested_on: 'MEE', frequency: 'high', note: 'Look for the shareholder who “voted no” or “wrote after the meeting”.' },
    depends_on: ['corp.appraisal-triggers'], anchor: 'appraisal-procedure-and-fair-value',
  },
  {
    id: 'corp.voluntary-dissolution', area_title: 'Dissolution', code: 'MBCA 14.02, 14.05', title: 'Voluntary dissolution and winding up', scope: 'course',
    elements: [
      'The board proposes dissolution and submits it to the shareholders (MBCA § 14.02).',
      'Shareholders approve by a majority of all the votes entitled to be cast, unless the articles or the board require more (MBCA § 14.02).',
      'After dissolution the corporation continues to exist only to wind up and liquidate its business and affairs (MBCA § 14.05).',
      'Creditors are paid before shareholders receive what remains.',
    ],
    traps: [
      { code: 'TIMING_OR_NOTICE', note: 'Dissolution does not end existence at once. The corporation survives for winding up and can still sue and be sued.' },
      { code: 'BURDEN_OR_SCRUTINY', note: 'The vote is a majority of all votes entitled to be cast, not of those present.' },
    ],
    statute_cites: ['MBCA § 14.02', 'MBCA § 14.05'], case_cites: [],
    bar_overlay: { tested_on: 'MEE', frequency: 'low', note: 'More often a sub-question inside a closely held corporation deadlock problem.' },
    depends_on: ['corp.vote-who-votes'], anchor: 'voluntary-dissolution',
  },
  {
    id: 'corp.judicial-dissolution', area_title: 'Dissolution', code: 'MBCA 14.30, 14.34', title: 'Judicial dissolution and the buyout election', scope: 'both',
    elements: [
      'Directors are deadlocked, the shareholders cannot break the deadlock, and irreparable injury is threatened or the business can no longer be conducted to the shareholders’ advantage (MBCA § 14.30(a)(2)).',
      'Those in control have acted, are acting or will act in a manner that is illegal, oppressive or fraudulent (MBCA § 14.30(a)(2)).',
      'Shareholders are deadlocked in voting power and have failed through at least two consecutive annual meeting dates to elect directors (MBCA § 14.30(a)(2)).',
      'Corporate assets are being misapplied or wasted (MBCA § 14.30(a)(2)).',
      'The corporation, or other shareholders, may avoid dissolution by electing to buy the petitioner’s shares at fair value (MBCA § 14.34).',
    ],
    traps: [
      { code: 'REMEDY_DAMAGES_LIMIT', note: 'Dissolution is not the only outcome. The corporation can elect to buy the petitioner out at fair value.' },
      { code: 'ELEMENT_BOUNDARY_MISS', note: 'Mere disagreement or low profits is not a ground. The petitioner must prove deadlock, illegality, oppression, fraud or waste.' },
    ],
    statute_cites: ['MBCA § 14.30(a)(2)', 'MBCA § 14.34'], case_cites: [],
    bar_overlay: { tested_on: 'MEE', frequency: 'medium', note: 'Pairs with minority-shareholder oppression questions in closely held corporations.' },
    depends_on: ['corp.voluntary-dissolution'], anchor: 'judicial-dissolution',
  },
  {
    id: 'corp.mee-issue-order', area_title: 'MEE Overlay', code: 'MEE', title: 'MEE roadmap: spot, vote, dissent', scope: 'bar_only',
    elements: [
      'Identify the transaction (merger, share exchange, asset sale or dissolution) and which corporation is which.',
      'Board action: did the board of each affected corporation adopt and submit the plan?',
      'Vote: which shareholders vote, and is the measure a majority of all votes entitled to be cast (MBCA § 11.04(e))?',
      'Exceptions: the short-form merger, the 20 percent survivor rule and the 25 percent asset-sale safe harbor (MBCA § 12.02(a)).',
      'Dissent: do the objecting shareholders have appraisal rights (MBCA § 13.02(a)), and did they follow the procedure?',
      'Delaware contrast: if the question says Delaware, switch rules (DGCL § 251(c), § 253, § 262, § 271) and remember the cash exception to the market-out and no appraisal on an asset sale.',
    ],
    traps: [
      { code: 'ELEMENT_BOUNDARY_MISS', note: 'Answering only “who votes” and skipping dissenters’ rights, the other half of every fundamental-change essay.' },
      { code: 'CL_VS_UCC', note: 'Applying the Delaware rule to an MBCA state, or the reverse, without checking which statute the question names.' },
    ],
    statute_cites: ['MBCA § 11.04(e)', 'MBCA § 12.02(a)', 'MBCA § 13.02(a)', 'DGCL § 251(c)', 'DGCL § 253', 'DGCL § 262', 'DGCL § 271'], case_cites: [],
    bar_overlay: { tested_on: 'MEE', frequency: 'high', note: 'The hub for the unit: every other rule hangs off these six steps.' },
    depends_on: ['corp.vote-who-votes', 'corp.asset-sale-test', 'corp.appraisal-triggers'], anchor: 'mee-roadmap',
  },
];

const el1 = (id) => corpNodes.find((n) => n.id === id).elements;
const corpOutline = [
  masthead('Fundamental Corporate Changes', 'Mergers, share exchanges, asset sales, appraisal and dissolution under the MBCA, with the MEE overlay and the Delaware contrasts', [
    'Student outline compiled from instructor notes · Showcase Mode',
    'Every citation in this outline appears in the packet’s table of authorities and was checked by the verifier',
  ]),
  band('mee-roadmap', 'I. Start Here: The MEE Roadmap', 'MEE · high frequency'),
  p('Almost every fundamental-change essay tells the same story with different facts. Work through it in this order and you will not skip an issue.'),
  roadmap('Issue-spotting order for a fundamental change', el1('corp.mee-issue-order')),
  trap('What costs points', 'Many answers stop at “who votes”. Dissenters’ rights are the other half of the story: say whether appraisal exists, whether the market-out cuts it off, and whether the shareholder followed the procedure.'),

  band('merger-and-share-exchange', 'II. Merger and Share Exchange', 'course + bar'),
  p('A merger combines corporations. A share exchange is a purchase of the target’s shares directly from its shareholders. Either way the same governance sequence applies: the board adopts, the shareholders approve, and dissenters may demand fair value.'),
  rule('Merger and share exchange', el1('corp.merger-mechanics')),
  h3('who-votes-and-what-vote', 'Who votes, and what vote'),
  rule('Vote required on a plan of merger or share exchange', el1('corp.vote-who-votes')),
  trap('Majority of what?', 'The MBCA measure is a majority of all the votes entitled to be cast, not a majority of the shares present or voting. If 1,000 shares are outstanding, 501 votes are needed even if only 600 attend. The acquirer’s shareholders do not vote in a share exchange.'),
  h3('triangular-mergers', 'Triangular mergers'),
  rule('Triangular merger', el1('corp.triangular'), 'Example: Acme forms AcmeCo Sub, which merges into Zeta (a reverse triangular merger). Zeta survives as Acme’s subsidiary. Zeta’s shareholders vote; Acme’s do not.'),
  h3('short-form-mergers', 'Short-form mergers'),
  rule('Short-form merger', el1('corp.short-form')),
  trap('Count to ninety', 'A parent with 85 percent, or a bare majority, cannot use the short form. Below the threshold the ordinary vote applies.'),

  band('sale-of-substantially-all-assets', 'III. Sale of Substantially All Assets', 'course + bar · MEE high'),
  p('An asset sale is not a merger. Only the seller acts, the buyer picks its assets and liabilities, and the statute asks a different question: does the sale leave the seller without a business?'),
  h3('when-an-asset-sale-needs-a-vote', 'When an asset sale needs a shareholder vote'),
  rule('Sale of all or substantially all assets', el1('corp.asset-sale-test')),
  trap('Both prongs of the safe harbor', 'Keeping a business that is 30 percent of assets but only 10 percent of income does not trigger the safe harbor. The retained business must be at least 25 percent of total assets and at least 25 percent of income or revenues.'),
  caseCard({
    tag: 'note case · the quantity-and-quality test', name: 'Katz v. Bregman (Del. Ch. 1981)',
    facts: 'A corporation agreed to sell a subsidiary business representing about half of its assets and a large share of its sales, without a stockholder vote.',
    held: 'The sale was of substantially all assets, so DGCL § 271 required a stockholder vote.',
    why: 'Delaware measures “substantially all” by quantity and quality, with no 25 percent safe harbor like the MBCA’s.',
  }),
  h3('asset-sale-vs-merger', 'Asset sale versus merger'),
  rule('Asset sale or merger? Same deal, different law', el1('corp.asset-sale-vs-merger')),
  caseCard({
    tag: 'main case · independent legal significance', name: 'Hariton v. Arco Electronics, Inc. (Del. 1963)',
    facts: 'Arco sold all of its assets to Loral for Loral stock and then dissolved. A minority shareholder argued that the deal was really a merger and that Arco’s shareholders should have appraisal rights.',
    held: 'The sale complied with the asset-sale statute and was valid. Delaware would not recharacterize it as a merger to create appraisal rights.',
    why: 'Delaware treats the statutes as independent routes. The MBCA now grants appraisal on a voted asset sale directly, and a few states, such as Pennsylvania in *Farris v. Glen Alden Corp.*, went the other way under the de facto merger doctrine.',
  }),

  band('appraisal-rights', 'IV. Appraisal Rights', 'MEE · high frequency'),
  p('Appraisal lets a dissenting shareholder exchange shares for a cash payment of their judicially determined fair value. It is a statutory right: the shareholder must qualify, and then must follow the procedure exactly.'),
  h3('when-appraisal-rights-exist', 'When appraisal rights exist'),
  rule('Appraisal triggers and the market-out', el1('corp.appraisal-triggers')),
  trap('Follow the vote', 'Appraisal rights under the MBCA generally follow the right to vote. If the sale needed no shareholder vote, there is no appraisal.'),
  h3('appraisal-procedure-and-fair-value', 'Procedure and fair value'),
  rule('Perfecting appraisal and getting paid', el1('corp.appraisal-procedure')),
  trap('Voted no, but wrote late', 'A shareholder who voted against the deal but sent no written notice before the vote has not perfected appraisal. And one who voted in favor has forfeited it.'),
  caseCard({
    tag: 'cited case · fair value and fairness', name: 'Weinberger v. UOP, Inc. (Del. 1983)',
    facts: 'A parent that already owned about 50 percent of UOP cashed out the minority in a merger at a price its own directors had studied but did not disclose to the minority.',
    held: 'A controlling-shareholder merger is reviewed for entire fairness, meaning fair dealing and fair price, and appraisal valuation considers all relevant factors.',
    why: 'It is the Delaware anchor for cash-out mergers and for what “fair value” in appraisal means.',
  }),

  band('dissolution', 'V. Dissolution', 'course + bar'),
  p('Dissolution ends the corporation’s business, not its existence. Voluntary dissolution mirrors the merger vote; judicial dissolution is the closely held corporation’s remedy for deadlock and abuse.'),
  h3('voluntary-dissolution', 'Voluntary dissolution and winding up'),
  rule('Dissolving by board and shareholder action', el1('corp.voluntary-dissolution')),
  h3('judicial-dissolution', 'Judicial dissolution'),
  rule('Grounds for a shareholder petition', el1('corp.judicial-dissolution'), 'In practice this is a remedy for closely held corporations.'),
  trap('Dissolution is the last resort', 'Even when a ground is proved, the corporation or the other shareholders may elect to buy the petitioner out at fair value, and courts are reluctant to dissolve a profitable business.'),

  band('mbca-v-delaware', 'VI. MBCA v. Delaware: The Side-by-Side', 'bar overlay'),
  p('Check which statute the question names before you write. The two systems agree on the basic majority vote and diverge on asset sales and appraisal.'),
  table(['Issue', 'MBCA (as revised)', 'Delaware'], [
    ['Vote to approve a merger', 'Majority of all votes entitled to be cast by each voting group (MBCA § 11.04(e))', 'Majority of the outstanding stock entitled to vote of each constituent corporation (DGCL § 251(c))'],
    ['Survivor’s shareholders', 'No vote if articles and shares are unchanged and new voting shares stay within 20 percent (MBCA § 11.04)', 'Same idea: no vote if the charter and shares are unchanged and issuance stays within 20 percent (DGCL § 251(f))'],
    ['Short-form merger', 'Parent holding at least 90 percent of the subsidiary’s voting shares (MBCA § 11.05)', 'Parent owning at least 90 percent of each class; appraisal remains (DGCL § 253; DGCL § 262)'],
    ['When an asset sale needs a vote', 'Only if it leaves the corporation without a significant continuing business activity; 25 percent safe harbor (MBCA § 12.02(a))', 'All or substantially all assets, judged by quantity and quality, with no safe harbor (DGCL § 271; *Katz v. Bregman*)'],
    ['Appraisal on an asset sale', 'Yes, if the shareholder is entitled to vote (MBCA § 13.02(a))', 'No, unless the charter provides (DGCL § 262; *Hariton v. Arco Electronics, Inc.*)'],
    ['Market-out', 'No appraisal for listed or widely held shares unless an interested transaction (MBCA § 13.02(b))', 'No appraisal for listed or widely held shares unless holders must take cash or unlisted securities (DGCL § 262)'],
    ['Appraisal procedure and value', 'Notice of intent before the vote, no vote in favor (MBCA § 13.21); fair value without minority or marketability discount (MBCA § 13.01)', 'Written demand before the vote; court weighs all relevant factors (DGCL § 262; *Weinberger v. UOP, Inc.*)'],
  ]),
].join('\n');

const corpQuestions = [
  {
    stem: 'Brightline Foods, Inc., a corporation governed by the Model Business Corporation Act, makes frozen vegetables and has no other business. Its board unanimously agrees to sell all of Brightline’s plants, brands and inventory to Harvest Co. for cash. The sale is outside the ordinary course of Brightline’s business and will leave Brightline with only cash and its liabilities. Brightline’s articles are silent on the vote required. Which approval is required for Brightline to complete the sale?',
    choices: [
      no('ELEMENT_BOUNDARY_MISS', 'The approval of Brightline’s board alone, because a sale for cash does not change what the shareholders own.', 'This leaves out the shareholder vote. A sale of substantially all assets outside the ordinary course that leaves the seller without a significant continuing business needs shareholder approval under MBCA § 12.02(a); the form of the consideration is irrelevant.'),
      ok('The approval of Brightline’s board and of a majority of all the votes entitled to be cast by Brightline’s shareholders.', 'Correct. The board proposes the sale and the selling corporation’s shareholders approve it by a majority of all the votes entitled to be cast, unless the articles or the board require more (MBCA § 12.02).'),
      no('BURDEN_OR_SCRUTINY', 'The approval of Brightline’s board and of a majority of the votes cast at a meeting at which a quorum is present.', 'This uses the wrong measure. The MBCA counts a majority of all the votes entitled to be cast, not of the votes cast at the meeting (MBCA § 12.02).'),
      no('JURISDICTION_PROCEDURAL', 'The approval of Brightline’s board and of a majority of the shareholders of both Brightline and Harvest, each voting separately.', 'Only the selling corporation’s shareholders vote on an asset sale. Harvest is buying assets, not merging, so its shareholders have no statutory vote (MBCA § 12.02).'),
      no('CL_VS_UCC', 'The approval of Brightline’s board and of two-thirds of Brightline’s outstanding shares.', 'Two-thirds was the traditional statutory supermajority. The revised MBCA default is a majority of all votes entitled to be cast, unless the articles require more (MBCA § 12.02).'),
    ],
    explanation: 'MBCA § 12.02(a) requires shareholder approval when a disposition outside the ordinary course would leave the corporation without a significant continuing business activity. The board proposes the sale and Brightline’s shareholders approve it by a majority of all the votes entitled to be cast (MBCA § 12.02). Harvest’s shareholders do not vote, and Brightline’s shareholders who are entitled to vote also have appraisal rights (MBCA § 13.02(a)).',
    node_id: 'corp.asset-sale-test', cites: ['MBCA § 12.02(a)', 'MBCA § 12.02', 'MBCA § 13.02(a)'],
  },
  {
    stem: 'Same facts, except that Brightline also operates a frozen-dessert line that is not part of the sale. At the end of the most recent fiscal year the dessert line represented 30 percent of Brightline’s total assets and 35 percent of its income from continuing operations before taxes. Which approval is required for Brightline to complete the sale of the vegetable business?',
    is_variation: true, parent_index: 0,
    choices: [
      no('ELEMENT_BOUNDARY_MISS', 'The approval of Brightline’s board and of a majority of all the votes entitled to be cast by Brightline’s shareholders, because the sale is outside the ordinary course.', 'Outside the ordinary course is not enough. Shareholder approval is required only if the sale leaves the corporation without a significant continuing business activity (MBCA § 12.02(a)), and here it does not.'),
      no('MERCHANT_THRESHOLD', 'The approval of Brightline’s board and of a majority of all the votes entitled to be cast, because a retained business counts only if it is at least half of the corporation’s assets.', 'The safe harbor threshold is 25 percent, not 50 percent. A retained business with at least 25 percent of total assets and 25 percent of income or revenues is conclusively a significant continuing business (MBCA § 12.02(a)).'),
      no('JURISDICTION_PROCEDURAL', 'The approval of Brightline’s board and of a majority of Harvest’s shareholders, because Harvest is acquiring a major business.', 'The buyer’s shareholders do not vote on an asset purchase (MBCA § 12.02).'),
      ok('The approval of Brightline’s board alone, because Brightline keeps a business that satisfies the 25 percent safe harbor.', 'Correct. The dessert line is at least 25 percent of total assets and at least 25 percent of income from continuing operations, so Brightline is conclusively deemed to keep a significant continuing business activity and no shareholder vote is required (MBCA § 12.02(a); MBCA § 12.01).'),
      no('REMEDY_DAMAGES_LIMIT', 'The approval of Brightline’s board alone, but Brightline’s shareholders may still demand appraisal because the sale is outside the ordinary course.', 'Appraisal on an asset sale follows the right to vote under § 12.02. With no shareholder vote there is no appraisal right (MBCA § 13.02(a)).'),
    ],
    explanation: 'The sale needs a shareholder vote only if it would leave Brightline without a significant continuing business activity (MBCA § 12.02(a)). Brightline keeps a dessert line that is at least 25 percent of total assets and at least 25 percent of income from continuing operations, so the safe harbor applies, the board’s approval is enough, and, because shareholders are not entitled to vote, there are no appraisal rights (MBCA § 13.02(a)).',
    node_id: 'corp.asset-sale-test', cites: ['MBCA § 12.02(a)', 'MBCA § 12.01', 'MBCA § 12.02', 'MBCA § 13.02(a)'],
  },
  {
    stem: 'Pioneer Dental Supply, Inc., a privately held corporation governed by the Model Business Corporation Act, has about 120 shareholders. Pioneer’s board adopts a plan to merge Pioneer into Giant Dental Corp. for cash, and Pioneer’s shareholders approve the plan at a special meeting by a majority of all the votes entitled to be cast. Rosa, who owns 8 percent of Pioneer, attends the meeting and votes against the merger. She sent the corporation nothing in writing before the vote. After the merger takes effect, Rosa writes to the corporation demanding payment of the fair value of her shares. Does Rosa have appraisal rights?',
    choices: [
      no('TIMING_OR_NOTICE', 'Yes, because a demand made after the merger takes effect is timely if it is made within a reasonable time.', 'Timing is the problem. The shareholder must give written notice of intent to demand payment before the vote is taken; a later demand cannot cure the omission (MBCA § 13.21).'),
      no('ELEMENT_BOUNDARY_MISS', 'Yes, because she voted against the merger and a cash-out merger always triggers appraisal rights.', 'Voting against is only one of the requirements. She must also deliver written notice of intent before the vote (MBCA § 13.21), and she did not.'),
      ok('No, because she did not deliver written notice of her intent to demand payment before the vote was taken.', 'Correct. A shareholder entitled to vote on a merger has appraisal rights (MBCA § 13.02(a)) but must deliver written notice of intent before the vote and must not vote in favor (MBCA § 13.21). Rosa skipped the notice.'),
      no('MERCHANT_THRESHOLD', 'No, because appraisal rights are not available to shareholders of a privately held corporation.', 'This reverses the market-out. Appraisal is cut off for widely traded shares (MBCA § 13.02(b)), not for a private company.'),
      no('JURISDICTION_PROCEDURAL', 'No, because appraisal rights apply to sales of substantially all assets but not to mergers.', 'Mergers are the first appraisal trigger. A shareholder entitled to vote on a merger has appraisal rights (MBCA § 13.02(a)).'),
    ],
    explanation: 'Appraisal rights attach to a merger on which the shareholder is entitled to vote (MBCA § 13.02(a)), but a shareholder who wants them must deliver written notice of intent to demand payment before the vote is taken and must not vote in favor (MBCA § 13.21). Rosa voted against but sent no notice, so she has lost appraisal. The market-out in MBCA § 13.02(b) cuts off appraisal for widely traded stock, not for a private company.',
    node_id: 'corp.appraisal-procedure', cites: ['MBCA § 13.02(a)', 'MBCA § 13.21', 'MBCA § 13.02(b)'],
  },
  {
    stem: 'Same facts, except that Rosa delivered written notice to Pioneer of her intent to demand payment before the vote was taken. After the merger takes effect, the parties cannot agree on a price. Does Rosa have appraisal rights, and how is the value of her shares measured?',
    is_variation: true, parent_index: 2,
    choices: [
      no('REMEDY_DAMAGES_LIMIT', 'Yes, but the court should discount her shares to reflect minority status and lack of marketability.', 'Fair value is determined without a discount for lack of marketability or minority status (MBCA § 13.01).'),
      no('BURDEN_OR_SCRUTINY', 'Yes, but only if she proves that the merger price was unfair to Pioneer’s shareholders.', 'Appraisal is a statutory right to fair value. It does not depend on proving that the transaction was unfair (MBCA § 13.02(a)).'),
      no('ELEMENT_BOUNDARY_MISS', 'No, because a shareholder who votes against a merger cannot also demand payment for her shares.', 'The statute bars voting in favor, not voting against. A dissenter who gave notice and did not vote in favor qualifies (MBCA § 13.21).'),
      no('JURISDICTION_PROCEDURAL', 'No, because she must first sue to enjoin the merger before she can demand payment from the surviving corporation.', 'Appraisal does not require an injunction suit. After the demand, if the claim is unsettled, the corporation starts a proceeding to determine fair value (MBCA § 13.30).'),
      ok('Yes. She is entitled to the fair value of her shares immediately before the merger, without a discount for her minority position or the lack of a market for the shares.', 'Correct. Rosa gave notice before the vote and did not vote in favor (MBCA § 13.21), so she has appraisal rights (MBCA § 13.02(a)). Fair value is measured immediately before the merger, without a minority or marketability discount (MBCA § 13.01).'),
    ],
    explanation: 'Rosa did what MBCA § 13.21 requires: written notice before the vote and no vote in favor. She therefore has appraisal rights under MBCA § 13.02(a). Fair value is the value immediately before the merger, excluding value created in anticipation of it unless that would be inequitable, and without discounting for lack of marketability or minority status (MBCA § 13.01). If the parties cannot agree, a court determines the value in a proceeding under MBCA § 13.30.',
    node_id: 'corp.appraisal-procedure', cites: ['MBCA § 13.21', 'MBCA § 13.02(a)', 'MBCA § 13.01', 'MBCA § 13.30'],
  },
  {
    stem: 'Acme Software, Inc. is a privately held corporation governed by the Model Business Corporation Act. Acme forms a wholly owned subsidiary, AcmeCo Sub, which merges into Zeta Labs, Inc., a privately held corporation also governed by the Model Business Corporation Act. Zeta survives the merger as a wholly owned subsidiary of Acme, and Zeta’s shareholders receive Acme shares in exchange for their Zeta shares. Acme has enough authorized but unissued shares to cover the exchange, and the boards of Acme, AcmeCo Sub and Zeta have approved the merger. Whose shareholders must vote under the Act, and by what vote?',
    choices: [
      no('MERCHANT_THRESHOLD', 'No shareholders must vote, because Zeta survives as a subsidiary of Acme and the deal is a short-form merger.', 'The short-form merger requires a parent that already owns at least 90 percent of the subsidiary (MBCA § 11.05). Acme owns no Zeta shares.'),
      ok('Only Zeta’s shareholders, by a majority of all the votes entitled to be cast on the plan. Acme acts as sole shareholder of AcmeCo Sub, and Acme’s own shareholders have no vote.', 'Correct. Zeta is a party to the merger, so its shareholders vote by a majority of all votes entitled to be cast (MBCA § 11.04(e)). Acme is not a party, so its shareholders have no statutory merger vote.'),
      no('JURISDICTION_PROCEDURAL', 'Both Acme’s and Zeta’s shareholders, each by a majority of all the votes entitled to be cast.', 'The vote attaches to the parties to the merger. Acme is not a party to the merger; its subsidiary is (MBCA § 11.04).'),
      no('CL_VS_UCC', 'Only Zeta’s shareholders, but by two-thirds of the outstanding shares because the merger changes control.', 'The MBCA default is a majority of all the votes entitled to be cast, unless the articles or the board require more (MBCA § 11.04(e)). Two-thirds was the traditional statutory rule.'),
    ],
    explanation: 'In a reverse triangular merger the acquirer’s subsidiary merges into the target, which survives. Zeta is a party to the merger, so its board adopts the plan and its shareholders approve it by a majority of all the votes entitled to be cast (MBCA § 11.04; MBCA § 11.04(e)). Acme is not a party, so its shareholders have no statutory merger vote; Acme acts as the sole shareholder of AcmeCo Sub. The short-form merger in MBCA § 11.05 is unavailable because Acme holds no Zeta shares.',
    node_id: 'corp.triangular', cites: ['MBCA § 11.04', 'MBCA § 11.04(e)', 'MBCA § 11.05'],
  },
  {
    stem: 'Same facts, except that Acme already owns 92 percent of the outstanding voting shares of Zeta, which has only one class of stock, and Acme’s board adopts a plan merging Zeta into Acme. Which statement is correct?',
    is_variation: true, parent_index: 4,
    choices: [
      no('MERCHANT_THRESHOLD', 'The short-form procedure is available to any parent that holds a majority of the subsidiary’s voting shares, so Acme could use it with 60 percent.', 'The threshold is 90 percent, not a majority (MBCA § 11.05). A parent with 60 percent must obtain the ordinary shareholder approval.'),
      no('ELEMENT_BOUNDARY_MISS', 'Zeta’s shareholders must approve the plan by a majority of all votes entitled to be cast, because every merger needs the approval of each constituent corporation’s shareholders.', 'This misses the short-form exception. A parent owning 90 percent may merge the subsidiary into itself without the subsidiary’s shareholders voting (MBCA § 11.05).'),
      no('REMEDY_DAMAGES_LIMIT', 'Acme may merge Zeta into itself without a vote of Zeta’s shareholders, and Zeta’s minority shareholders have no remedy because short-form mergers are exempt from appraisal.', 'The minority is not left without a remedy. Shareholders of a subsidiary merged under § 11.05 have appraisal rights (MBCA § 13.02(a)).'),
      ok('Acme may merge Zeta into itself under the short-form procedure without a vote of Zeta’s shareholders, and Zeta’s minority shareholders may still demand appraisal.', 'Correct. A parent holding at least 90 percent may merge the subsidiary into itself without the subsidiary’s shareholder vote (MBCA § 11.05), and the minority keeps appraisal rights (MBCA § 13.02(a)). Delaware reaches the same result under DGCL § 253 and DGCL § 262.'),
    ],
    explanation: 'A parent that holds at least 90 percent of the subsidiary’s voting shares may merge the subsidiary into itself under MBCA § 11.05 without a vote of the subsidiary’s shareholders, because their vote could not change the outcome. The minority is protected by appraisal rights (MBCA § 13.02(a)). The threshold is 90 percent, not a majority. Delaware’s version is DGCL § 253, with appraisal under DGCL § 262.',
    node_id: 'corp.short-form', cites: ['MBCA § 11.05', 'MBCA § 13.02(a)', 'DGCL § 253', 'DGCL § 262'],
  },
];

const corporate = {
  id: 'corp-fundamental-changes',
  title: 'MBCA Fundamental Changes + MEE Overlay',
  subtitle: 'Mergers, share exchanges, asset sales, appraisal and dissolution, with the Delaware contrast the MEE rewards',
  subject_id: 'corporate-law',
  subject: {
    title: 'Corporate Law: Fundamental Changes', ncbe_category: 'Business Associations (MEE)', accent: '#0f6b66',
    description: 'Mergers, share exchanges, sales of substantially all assets, appraisal rights and dissolution under the Model Business Corporation Act, with a bar-exam (MEE) overlay and Delaware contrasts.',
  },
  source_name: 'Business Organizations, Unit 6: lecture notes (excerpt)',
  summary: 'A professor’s notes on MBCA Chapters 11 to 14 plus the list of what the MEE rewards. Compiles into a rule graph that separates what is taught from what is only tested, an outline with the Delaware side-by-side, and a fully cited question set.',
  highlights: [
    'Who votes and by what measure, with the 20 percent and 25 percent exceptions',
    'Appraisal triggers, the market-out and the notice-before-the-vote trap',
    'Delaware contrast table (DGCL §§ 251, 253, 262, 271)',
    'Bar-only rules flagged where the course never reaches them',
  ],
  material: corpMaterial,
  authorities: corpAuthorities,
  master_nodes: corpNodes,
  student_outline_html: corpOutline,
  questions: corpQuestions,
};

// =================================================================================================
// PACKET 2 — UCC § 2-102 hybrids and § 2-209 modification + common-law comparison
// =================================================================================================

const uccMaterial = `SALES AND LEASES - WEEK 5: SCOPE OF ARTICLE 2 AND MODIFICATION
Lecture notes with bar flags (UCC official text; Restatement for the common-law mirror image)

1. SCOPE: WHAT IS A "TRANSACTION IN GOODS"?
Article 2 applies to transactions in goods (UCC § 2-102). Goods are all things movable at the time of identification to the contract, including specially manufactured goods; money, investment securities and things in action are not goods (UCC § 2-105(1)). Services and real estate are outside Article 2, and the common law governs them.

2. HYBRID CONTRACTS
Many deals mix goods and services: equipment plus installation, a custom product plus design work. Most courts ask which predominates. Bonebrake v. Cox: is the thrust of the contract the sale of goods with labor incidental, or the rendition of services with goods incidental? Look at the language of the contract, how the price is allocated, the nature of the seller's business, and the relative value of the goods and the services. The answer usually governs the whole contract. Some courts instead look at the gravamen of the claim: does the complaint concern the goods or the services? Bar tip: always characterize first; everything after that depends on it.

3. MODIFICATION UNDER ARTICLE 2 (UCC § 2-209)
No consideration needed: an agreement modifying a contract within Article 2 needs no consideration to be binding (UCC § 2-209(1)). Good faith still applies: extorting a modification without a legitimate commercial reason is ineffective (UCC § 2-209 cmt. 2; UCC § 1-304). A market shift that makes performance more costly can supply a legitimate reason.
No-oral-modification clauses: a signed agreement that excludes modification except by a signed writing cannot be otherwise modified (UCC § 2-209(2)). If the clause is on a form supplied by a merchant, the other party must separately sign it, except as between merchants. "Merchant" is defined in UCC § 2-104(1): one who deals in goods of the kind or holds out special knowledge or skill about the goods or practices.
Statute of frauds: the requirements of UCC § 2-201 must be satisfied if the contract as modified is within its provisions (UCC § 2-209(3)). The threshold is $500 (UCC § 2-201(1)). Exceptions: written confirmation between merchants unless objected to within 10 days (UCC § 2-201(2)); specially manufactured goods, admissions, and goods paid for or accepted (UCC § 2-201(3)).
Waiver: an attempted modification that fails (2) or (3) can still operate as a waiver (UCC § 2-209(4)). A party who has waived an executory portion may retract by reasonable notification that strict performance will be required, unless retraction would be unjust in view of a material change of position in reliance (UCC § 2-209(5)).

4. THE COMMON-LAW MIRROR IMAGE
Preexisting duty rule: promising to do what you are already bound to do is not consideration (Restatement (Second) of Contracts § 73; Alaska Packers' Ass'n v. Domenico). So a promise to pay more for the same performance fails unless the other side gives something new.
Exceptions: Restatement (Second) of Contracts § 89 enforces a modification of an executory contract if it is fair and equitable in view of circumstances not anticipated by the parties (§ 89(a)), as provided by statute (§ 89(b)), or to the extent justice requires because of material reliance (§ 89(c)). Angel v. Murray applied the unanticipated-circumstances prong. A modification extracted by an improper threat that leaves no reasonable alternative is voidable for duress (Restatement (Second) of Contracts § 175; Austin Instrument, Inc. v. Loral Corp.).

5. BAR ORDER OF ATTACK
Characterize the contract (goods, services, hybrid), pick the rule (UCC § 2-209 or common law), test consideration, then form (the no-oral-modification clause and the statute of frauds), then waiver and retraction.`;

const uccAuthorities = [
  { cite: 'UCC § 1-304', text: 'Every contract or duty within the UCC imposes an obligation of good faith in its performance and enforcement.' },
  { cite: 'UCC § 2-102', text: 'Article 2 applies to transactions in goods; it does not apply to a transaction intended to operate only as a security transaction.' },
  { cite: 'UCC § 2-104(1)', text: 'A merchant deals in goods of the kind or, by occupation, holds itself out as having knowledge or skill peculiar to the practices or goods involved.' },
  { cite: 'UCC § 2-105(1)', text: '“Goods” means all things movable at the time of identification to the contract, including specially manufactured goods, other than money, investment securities and things in action.' },
  { cite: 'UCC § 2-201(1)', text: 'A contract for the sale of goods for the price of $500 or more is not enforceable without a writing sufficient to indicate a contract, signed by the party against whom enforcement is sought; it is not enforceable beyond the quantity shown.' },
  { cite: 'UCC § 2-201(2)', text: 'Between merchants, a written confirmation sufficient against the sender satisfies the writing requirement against the recipient unless written objection is given within 10 days of receipt.' },
  { cite: 'UCC § 2-201(3)', text: 'A contract failing subsection (1) is nevertheless enforceable for specially manufactured goods, to the extent of an admission in court, and for goods paid for and accepted or received and accepted.' },
  { cite: 'UCC § 2-209(1)', text: 'An agreement modifying a contract within Article 2 needs no consideration to be binding.' },
  { cite: 'UCC § 2-209(2)', text: 'A signed agreement that excludes modification or rescission except by a signed writing cannot be otherwise modified or rescinded; but except as between merchants such a requirement on a form supplied by the merchant must be separately signed by the other party.' },
  { cite: 'UCC § 2-209(3)', text: 'The statute of frauds requirements of § 2-201 must be satisfied if the contract as modified is within its provisions.' },
  { cite: 'UCC § 2-209(4)', text: 'Although an attempt at modification does not satisfy subsection (2) or (3), it can operate as a waiver.' },
  { cite: 'UCC § 2-209(5)', text: 'A party who has made a waiver affecting an executory portion of the contract may retract it by reasonable notification that strict performance will be required, unless retraction would be unjust in view of a material change of position in reliance on the waiver.' },
  { cite: 'UCC § 2-209 cmt. 2', text: 'Modifications must meet the good-faith test. The extortion of a modification without legitimate commercial reason is ineffective; a market shift that makes performance a loss may supply such a reason.' },
  { cite: 'Restatement (Second) of Contracts § 73', text: 'Performance of a legal duty owed to the promisor, which is neither doubtful nor the subject of honest dispute, is not consideration.' },
  { cite: 'Restatement (Second) of Contracts § 89', text: 'A promise modifying a duty under a contract not fully performed on either side is binding (a) if fair and equitable in view of circumstances not anticipated by the parties, (b) to the extent provided by statute, or (c) to the extent justice requires in view of material change of position in reliance.' },
  { cite: 'Restatement (Second) of Contracts § 89(a)', text: 'A modification of an executory contract is binding if it is fair and equitable in view of circumstances not anticipated by the parties when the contract was made.' },
  { cite: 'Restatement (Second) of Contracts § 89(b)', text: 'A modification is binding to the extent provided by statute.' },
  { cite: 'Restatement (Second) of Contracts § 89(c)', text: 'A modification is binding to the extent that justice requires enforcement in view of a material change of position in reliance on the promise.' },
  { cite: 'Restatement (Second) of Contracts § 175', text: 'If a party’s assent is induced by an improper threat that leaves no reasonable alternative, the contract is voidable by the victim.' },
  { cite: 'Bonebrake v. Cox, 499 F.2d 951 (8th Cir. 1974)', text: 'For a mixed contract the test is the predominant factor: whether the thrust of the contract is the sale of goods with labor incidental, or the rendition of services with goods incidental.' },
  { cite: 'Alaska Packers’ Ass’n v. Domenico, 117 F. 99 (9th Cir. 1902)', text: 'Seamen who refused to work unless promised more than their contract wage gave no consideration for the increase, because they were already bound to perform.' },
  { cite: 'Angel v. Murray, 322 A.2d 630 (R.I. 1974)', text: 'A mid-contract promise of extra pay was enforceable where it was fair and equitable in view of circumstances, a large increase in the work, that the parties did not anticipate.' },
  { cite: 'Austin Instrument, Inc. v. Loral Corp., 272 N.E.2d 533 (N.Y. 1971)', text: 'A modification extracted by a threat to stop deliveries, where the victim had no practical alternative source, was voidable for economic duress.' },
];

const uccNodes = [
  {
    id: 'ucc.goods-scope', area_title: 'Scope: Goods vs. Services', code: 'UCC 2-102, 2-105', title: 'Article 2 applies to transactions in goods', scope: 'both',
    elements: [
      'Article 2 applies to transactions in goods (UCC § 2-102).',
      'Goods are all things movable at the time of identification to the contract, including specially manufactured goods (UCC § 2-105(1)).',
      'Money, investment securities and things in action are not goods, and services and real estate are outside Article 2 (UCC § 2-105(1); UCC § 2-102).',
      'Outside Article 2, the common law of contracts governs.',
    ],
    traps: [
      { code: 'CL_VS_UCC', note: 'Applying the UCC to a services or real estate contract because a product is mentioned somewhere in the deal.' },
      { code: 'ELEMENT_BOUNDARY_MISS', note: 'Treating money, securities, services or land as “goods”. The test is the thing sold, not who the parties are.' },
    ],
    statute_cites: ['UCC § 2-102', 'UCC § 2-105(1)'], case_cites: [],
    bar_overlay: { tested_on: 'both', frequency: 'high', note: 'The first step of every sales question: is this a transaction in goods?' },
    depends_on: [], anchor: 'scope-of-article-2',
  },
  {
    id: 'ucc.hybrid-test', area_title: 'Scope: Goods vs. Services', code: 'UCC 2-102; Bonebrake', title: 'Hybrid contracts: the predominant-purpose test', scope: 'both',
    elements: [
      'A hybrid contract sells goods and services together: equipment plus installation, or a custom product plus design work.',
      'Most courts ask which predominates: is the thrust of the contract the sale of goods with services incidental, or the rendition of services with goods incidental (Bonebrake v. Cox; UCC § 2-102)?',
      'Look at the contract language, how the price is allocated, the nature of the supplier’s business and the relative value of the goods and services.',
      'The answer usually governs the whole contract: Article 2 throughout if goods predominate, the common law throughout if services predominate.',
      'Some courts instead ask what the gravamen of the claim is, whether it concerns the goods or the services.',
    ],
    traps: [
      { code: 'CL_VS_UCC', note: 'Treating any service component as pulling the whole contract out of Article 2.' },
      { code: 'ELEMENT_BOUNDARY_MISS', note: 'Deciding on price alone. Relative value is one factor, not the test.' },
    ],
    statute_cites: ['UCC § 2-102'], case_cites: ['Bonebrake v. Cox'],
    bar_overlay: { tested_on: 'MBE', frequency: 'high', note: 'A perennial MBE vehicle for “which body of law governs?”' },
    depends_on: ['ucc.goods-scope'], anchor: 'hybrid-contracts-predominant-purpose',
  },
  {
    id: 'ucc.modification-no-consideration', area_title: 'Modification (§ 2-209)', code: 'UCC 2-209(1)', title: 'Modification needs no consideration, but must be in good faith', scope: 'both',
    elements: [
      'An agreement modifying a contract within Article 2 needs no consideration to be binding (UCC § 2-209(1)).',
      'The modification must meet the good-faith test: extorting a modification without a legitimate commercial reason is ineffective (UCC § 2-209 cmt. 2; UCC § 1-304).',
      'A market shift that makes performance more costly can be a legitimate commercial reason, even if it would not excuse performance (UCC § 2-209 cmt. 2).',
      'The parties must still agree. One side cannot impose a modification unilaterally.',
    ],
    traps: [
      { code: 'CL_VS_UCC', note: 'Applying the common-law preexisting duty rule to a sale of goods.' },
      { code: 'ELEMENT_BOUNDARY_MISS', note: 'Forgetting the good-faith limit, so a coerced price increase is treated as automatically enforceable.' },
    ],
    statute_cites: ['UCC § 2-209(1)', 'UCC § 2-209 cmt. 2', 'UCC § 1-304'], case_cites: [],
    bar_overlay: { tested_on: 'both', frequency: 'high', note: 'Tested as the contrast with the common-law preexisting duty rule.' },
    depends_on: ['ucc.goods-scope'], anchor: 'modification-without-consideration',
  },
  {
    id: 'ucc.merchant-status', area_title: 'Modification (§ 2-209)', code: 'UCC 2-104', title: 'Merchant status: where it changes the answer', scope: 'both',
    elements: [
      'A merchant deals in goods of the kind or, by occupation, holds itself out as having knowledge or skill peculiar to the practices or goods involved (UCC § 2-104(1)).',
      'Status decides whether the separate-signature rule for no-oral-modification clauses applies (UCC § 2-209(2)).',
      'Status decides whether the merchant’s written confirmation can satisfy the statute of frauds against the recipient (UCC § 2-201(2)).',
      'A consumer buying for personal use is not a merchant, however careful she is. A buyer in the trade is.',
    ],
    traps: [
      { code: 'MERCHANT_THRESHOLD', note: 'Treating a careful consumer as a merchant, or ignoring that a trade buyer is one.' },
    ],
    statute_cites: ['UCC § 2-104(1)', 'UCC § 2-209(2)', 'UCC § 2-201(2)'], case_cites: [],
    bar_overlay: { tested_on: 'both', frequency: 'high', note: 'Merchant status is the hinge of several UCC form rules.' },
    depends_on: [], anchor: 'merchant-status',
  },
  {
    id: 'ucc.nom-clause', area_title: 'Modification (§ 2-209)', code: 'UCC 2-209(2)', title: 'No-oral-modification clauses and the separate-signature rule', scope: 'both',
    elements: [
      'A signed agreement that excludes modification or rescission except by a signed writing cannot be otherwise modified or rescinded (UCC § 2-209(2)).',
      'If the clause is on a form supplied by a merchant, the other party must separately sign it, except as between merchants (UCC § 2-209(2)).',
      'So a consumer who signs a merchant’s form but does not separately sign the clause is not bound by it, and an oral modification is not barred by it.',
      'Between two merchants, no separate signature is needed, and the clause is effective.',
    ],
    traps: [
      { code: 'MERCHANT_THRESHOLD', note: 'Requiring a separate signature between two merchants, or skipping it when a consumer signs a merchant’s form.' },
      { code: 'ELEMENT_BOUNDARY_MISS', note: 'Treating a no-oral-modification clause as always enforceable, or never enforceable.' },
    ],
    statute_cites: ['UCC § 2-209(2)'], case_cites: [],
    bar_overlay: { tested_on: 'both', frequency: 'medium', note: 'Look for a preprinted form and a buyer who is not in the trade.' },
    depends_on: ['ucc.modification-no-consideration', 'ucc.merchant-status'], anchor: 'no-oral-modification-clauses',
  },
  {
    id: 'ucc.mod-sof', area_title: 'Modification (§ 2-209)', code: 'UCC 2-209(3), 2-201', title: 'Statute of frauds applies to the modified contract', scope: 'both',
    elements: [
      'The statute of frauds must be satisfied if the contract as modified is within its provisions (UCC § 2-209(3)).',
      'A contract for the sale of goods for $500 or more is not enforceable without a writing signed by the party against whom enforcement is sought (UCC § 2-201(1)).',
      'Test the contract as modified: an oral change that raises the price from $480 to $540 puts the modified contract within § 2-201; a change from $480 to $495 does not.',
      'Between merchants, a written confirmation can satisfy the requirement against the recipient unless it objects in writing within 10 days (UCC § 2-201(2)).',
      'Specially manufactured goods, admissions in court, and goods paid for and accepted can still save an oral deal (UCC § 2-201(3)).',
    ],
    traps: [
      { code: 'ELEMENT_BOUNDARY_MISS', note: 'Testing only the original contract. A modification that lifts the price over the threshold needs a signed writing.' },
      { code: 'MERCHANT_THRESHOLD', note: 'Misremembering the dollar threshold, which is $500 in the official text of § 2-201.' },
    ],
    statute_cites: ['UCC § 2-209(3)', 'UCC § 2-201(1)', 'UCC § 2-201(2)', 'UCC § 2-201(3)'], case_cites: [],
    bar_overlay: { tested_on: 'both', frequency: 'medium', note: 'The “price crosses $500” fact pattern is a favorite.' },
    depends_on: ['ucc.modification-no-consideration'], anchor: 'statute-of-frauds-and-modification',
  },
  {
    id: 'ucc.waiver-retraction', area_title: 'Modification (§ 2-209)', code: 'UCC 2-209(4)–(5)', title: 'Waiver and retraction', scope: 'both',
    elements: [
      'An attempted modification that fails the no-oral-modification or statute of frauds requirements can still operate as a waiver (UCC § 2-209(4)).',
      'A party who waived an executory portion of the contract may retract the waiver by reasonable notification that strict performance will be required (UCC § 2-209(5)).',
      'Retraction is not allowed where it would be unjust in view of the other party’s material change of position in reliance on the waiver (UCC § 2-209(5)).',
    ],
    traps: [
      { code: 'ELEMENT_BOUNDARY_MISS', note: 'Saying a failed modification has no effect at all. It may still be a waiver.' },
      { code: 'TIMING_OR_NOTICE', note: 'Retraction works only prospectively, by reasonable notification, and not after material reliance.' },
    ],
    statute_cites: ['UCC § 2-209(4)', 'UCC § 2-209(5)'], case_cites: [],
    bar_overlay: { tested_on: 'both', frequency: 'medium', note: 'The last step of any failed-modification analysis.' },
    depends_on: ['ucc.nom-clause', 'ucc.mod-sof'], anchor: 'waiver-and-retraction',
  },
  {
    id: 'cl.preexisting-duty', area_title: 'Common-Law Comparison', code: 'Restatement (Second) § 73', title: 'Common law: the preexisting duty rule', scope: 'bar_only',
    elements: [
      'At common law a modification of an executory contract must be supported by consideration.',
      'A promise to do what one is already legally bound to do is not consideration (Restatement (Second) of Contracts § 73; Alaska Packers’ Ass’n v. Domenico).',
      'So a promise to pay more for the same performance is unenforceable unless the other side gives something new: a different or additional performance, or a new promise.',
    ],
    traps: [
      { code: 'CL_VS_UCC', note: 'Carrying the UCC no-consideration rule into a services or real estate contract.' },
      { code: 'ELEMENT_BOUNDARY_MISS', note: 'Missing that a genuinely new promise or performance by the party demanding more supplies consideration.' },
    ],
    statute_cites: ['Restatement (Second) of Contracts § 73'], case_cites: ['Alaska Packers’ Ass’n v. Domenico'],
    bar_overlay: { tested_on: 'MBE', frequency: 'high', note: 'The mirror image of UCC § 2-209(1). Expect both in one question set.' },
    depends_on: ['ucc.goods-scope'], anchor: 'common-law-preexisting-duty',
  },
  {
    id: 'cl.mod-exceptions', area_title: 'Common-Law Comparison', code: 'Restatement (Second) §§ 89, 175', title: 'Common law: § 89 exceptions and duress', scope: 'bar_only',
    elements: [
      'A promise modifying a duty under a contract not fully performed on either side is binding if it is fair and equitable in view of circumstances not anticipated by the parties when the contract was made (Restatement (Second) of Contracts § 89(a); Angel v. Murray).',
      'Or to the extent provided by statute (Restatement (Second) of Contracts § 89(b)), such as UCC § 2-209(1).',
      'Or to the extent justice requires enforcement in view of a material change of position in reliance on the promise (Restatement (Second) of Contracts § 89(c)).',
      'A modification induced by an improper threat that leaves no reasonable alternative is voidable for duress (Restatement (Second) of Contracts § 175; Austin Instrument, Inc. v. Loral Corp.).',
    ],
    traps: [
      { code: 'ELEMENT_BOUNDARY_MISS', note: 'Treating an ordinary rise in costs as an unanticipated circumstance. Section 89(a) requires circumstances the parties did not anticipate.' },
      { code: 'TIMING_OR_NOTICE', note: 'Treating a duress-induced modification as void rather than voidable. The victim can ratify it by delay or by accepting benefits.' },
    ],
    statute_cites: ['Restatement (Second) of Contracts § 89', 'Restatement (Second) of Contracts § 175', 'UCC § 2-209(1)'], case_cites: ['Angel v. Murray', 'Austin Instrument, Inc. v. Loral Corp.'],
    bar_overlay: { tested_on: 'MBE', frequency: 'medium', note: 'Usually the second half of a common-law modification question.' },
    depends_on: ['cl.preexisting-duty'], anchor: 'restatement-89-and-duress',
  },
  {
    id: 'bar.characterize-then-modify', area_title: 'Bar Overlay', code: 'MBE/MEE', title: 'Bar roadmap: characterize, then modify', scope: 'bar_only',
    elements: [
      'Characterize the contract: goods, services or a hybrid. If mixed, apply the predominant-purpose test (UCC § 2-102).',
      'Choose the rule: UCC § 2-209 for goods, the common law (preexisting duty rule, Restatement (Second) of Contracts § 89) for services.',
      'Test consideration: none is needed under UCC § 2-209(1), but the change must be in good faith.',
      'Check form: the no-oral-modification clause and who supplied the form (UCC § 2-209(2)), then the statute of frauds on the modified contract (UCC § 2-209(3)).',
      'If the form fails, think waiver and whether it can be retracted (UCC § 2-209(4); UCC § 2-209(5)).',
    ],
    traps: [
      { code: 'CL_VS_UCC', note: 'Skipping step one and applying the wrong body of law.' },
      { code: 'ELEMENT_BOUNDARY_MISS', note: 'Stopping at “no consideration needed” and missing the form rules.' },
    ],
    statute_cites: ['UCC § 2-102', 'UCC § 2-209(1)', 'UCC § 2-209(2)', 'UCC § 2-209(3)', 'UCC § 2-209(4)', 'UCC § 2-209(5)', 'Restatement (Second) of Contracts § 89'], case_cites: [],
    bar_overlay: { tested_on: 'both', frequency: 'high', note: 'MBE: choose the governing law. MEE: write the whole sequence.' },
    depends_on: ['ucc.hybrid-test', 'ucc.modification-no-consideration', 'cl.preexisting-duty', 'ucc.waiver-retraction'], anchor: 'bar-roadmap',
  },
];

const el2 = (id) => uccNodes.find((n) => n.id === id).elements;
const uccOutline = [
  masthead('Hybrid Contracts and Modification', 'UCC § 2-102 scope and § 2-209 modification, with the common-law mirror image for the bar', [
    'Student outline compiled from lecture notes · Showcase Mode',
    'Every citation in this outline appears in the packet’s table of authorities and was checked by the verifier',
  ]),
  band('bar-roadmap', 'I. Start Here: Characterize, Then Modify', 'MBE + MEE · high frequency'),
  p('Modification questions are really two questions in one. First: which body of law governs? Second: under that law, does the change bind?'),
  roadmap('Order of attack', el2('bar.characterize-then-modify')),
  trap('The shortcut that costs points', 'Reciting “no consideration needed” without first deciding that the contract is for goods. If services predominate, the answer flips.'),

  band('scope-of-article-2', 'II. Scope: Goods, Services and Hybrids', 'course + bar'),
  h3('scope-of-article-2-rule', 'What Article 2 covers'),
  rule('Transactions in goods', el2('ucc.goods-scope')),
  h3('hybrid-contracts-predominant-purpose', 'Hybrid contracts: predominant purpose'),
  rule('Predominant-purpose test', el2('ucc.hybrid-test')),
  trap('Price is a factor, not the test', 'A contract that allocates most of the price to services usually leans toward the common law, but courts also weigh the contract’s language and the nature of the supplier’s business. Do not decide on the dollar split alone.'),
  caseCard({
    tag: 'main case · predominant purpose', name: 'Bonebrake v. Cox (8th Cir. 1974)',
    facts: 'A buyer purchased bowling-alley equipment that the seller also installed. The dispute turned on whether the contract was for goods or for services.',
    held: 'The test for a mixed contract is whether its predominant factor, its thrust, is the sale of goods with labor incidental or the rendition of services with goods incidental. Here it was a sale of goods.',
    why: 'This is the standard formulation for hybrids. It decides whether Article 2, and so § 2-209, applies.',
  }),

  band('modification-under-2-209', 'III. Modification Under § 2-209', 'course + bar · high frequency'),
  p('Section 2-209 relaxes the common-law rules on modification but adds its own checkpoints: good faith, the no-oral-modification clause, the statute of frauds and waiver.'),
  h3('modification-without-consideration', 'No consideration, but good faith'),
  rule('Modification without consideration', el2('ucc.modification-no-consideration')),
  trap('Not a license to extort', 'A seller that holds up a buyer with a threat to stop performance, without a legitimate commercial reason, cannot enforce the “modification”. A genuine market shift can be a legitimate reason.'),
  h3('merchant-status', 'Merchant status'),
  rule('Who is a merchant', el2('ucc.merchant-status')),
  h3('no-oral-modification-clauses', 'No-oral-modification clauses'),
  rule('The separate-signature rule', el2('ucc.nom-clause'), 'Example: Lena, a consumer, signs a store’s preprinted form. A clause in the middle says the agreement can be modified only by a signed writing. Lena never signed that clause separately, so it does not bind her. If Lena were a dealer in the trade, it would.'),
  h3('statute-of-frauds-and-modification', 'Statute of frauds on the modified contract'),
  rule('Test the contract as modified', el2('ucc.mod-sof')),
  trap('Cross the line', 'A $480 contract orally changed to $495 stays under $500 and needs no writing. The same contract orally changed to $540 is within § 2-201 and needs a signed writing, unless an exception applies.'),
  h3('waiver-and-retraction', 'Waiver and retraction'),
  rule('A failed modification can still be a waiver', el2('ucc.waiver-retraction')),

  band('common-law-mirror-image', 'IV. The Common-Law Mirror Image', 'bar only'),
  p('If the contract is for services or real estate, the UCC rules fall away. The common law asks for consideration and polices coercion through duress.'),
  h3('common-law-preexisting-duty', 'The preexisting duty rule'),
  rule('Preexisting duty', el2('cl.preexisting-duty')),
  caseCard({
    tag: 'main case · preexisting duty', name: 'Alaska Packers’ Ass’n v. Domenico (9th Cir. 1902)',
    facts: 'Seamen hired for a season of salmon fishing refused to work at the fishing grounds until the employer promised them more than the contract wage. The employer agreed, then refused to pay the increase.',
    held: 'The promise to pay more was not supported by consideration, because the seamen were already bound to perform.',
    why: 'It is the classic statement of the preexisting duty rule that UCC § 2-209(1) displaces for goods.',
  }),
  h3('restatement-89-and-duress', 'Section 89 exceptions and duress'),
  rule('When a common-law modification binds anyway', el2('cl.mod-exceptions')),
  caseCard({
    tag: 'note case · unanticipated circumstances', name: 'Angel v. Murray (R.I. 1974)',
    facts: 'A contractor with a fixed-price contract to collect a city’s refuse asked for extra pay after the number of homes served grew far beyond what the parties expected. The city agreed.',
    held: 'The promise of additional pay was enforceable because the modification was fair and equitable in view of circumstances the parties did not anticipate.',
    why: 'It applies the unanticipated-circumstances prong that is now Restatement (Second) of Contracts § 89(a).',
  }),
  caseCard({
    tag: 'note case · economic duress', name: 'Austin Instrument, Inc. v. Loral Corp. (N.Y. 1971)',
    facts: 'A subcontractor threatened to stop deliveries needed for a defense contract unless the prime contractor agreed to higher prices. The prime contractor could not obtain the parts elsewhere in time, agreed, and later sued to recover the increase.',
    held: 'The modification was voidable for economic duress because the threat left the prime contractor no practical alternative.',
    why: 'It shows how the common law polices a coerced modification that UCC § 2-209 handles through good faith.',
  }),

  band('side-by-side', 'V. Side by Side: UCC and Common Law', 'bar overlay'),
  p('Memorize the contrast. Questions often change one fact, goods to services, and expect the rule to flip.'),
  table(['Question', 'UCC Article 2 (goods)', 'Common law (services, real estate)'], [
    ['Which law applies?', 'Transactions in goods (UCC § 2-102); hybrids by predominant purpose (*Bonebrake v. Cox*)', 'Everything else, including hybrids where services predominate'],
    ['Consideration for a modification', 'None needed (UCC § 2-209(1))', 'Required; preexisting duty rule (Restatement (Second) of Contracts § 73; *Alaska Packers’ Ass’n v. Domenico*)'],
    ['What saves a modification', 'Good faith is the only limit (UCC § 2-209 cmt. 2; UCC § 1-304)', 'Unanticipated circumstances, statute or reliance (Restatement (Second) of Contracts § 89; *Angel v. Murray*)'],
    ['Coercion', 'A bad-faith modification is ineffective (UCC § 2-209 cmt. 2)', 'Duress: an improper threat with no reasonable alternative (Restatement (Second) of Contracts § 175; *Austin Instrument, Inc. v. Loral Corp.*)'],
    ['No-oral-modification clause', 'Effective if signed; on a merchant’s form the other party must separately sign unless both are merchants (UCC § 2-209(2))', 'Courts commonly let the parties waive or orally rescind the clause; no separate-signature rule'],
    ['Statute of frauds on the modification', 'Applies if the contract as modified is within § 2-201, which starts at $500 (UCC § 2-209(3); UCC § 2-201(1))', 'Applies only if the modified contract falls within a category of the state statute, such as land or contracts that cannot be performed within a year'],
    ['A failed modification', 'May operate as a waiver, retractable by reasonable notification unless the other party materially relied (UCC § 2-209(4); UCC § 2-209(5))', 'Waiver or estoppel doctrines; reliance can make the promise binding (Restatement (Second) of Contracts § 89)'],
  ]),
].join('\n');

const uccQuestions = [
  {
    stem: 'Dana owns a bakery and hires Precision HVAC to supply and install a new ventilation unit for her ovens. The written contract calls for a unit “supplied and installed” for a lump sum of $44,000, of which $38,000 is allocated to the unit and $6,000 to installation labor. Precision sells HVAC equipment to the public and installs what it sells. After installation the unit fails repeatedly, and Dana sues for breach of contract. Which body of law governs the contract?',
    choices: [
      no('CL_VS_UCC', 'The common law, because the contract includes installation services.', 'Services in the deal do not by themselves take it out of Article 2. For a mixed contract the question is which element predominates (Bonebrake v. Cox).'),
      ok('Article 2, because the predominant purpose of the contract is the sale of goods and the installation is incidental.', 'Correct. Article 2 applies to transactions in goods (UCC § 2-102), and for a mixed contract the court asks whether the thrust is the sale of goods with labor incidental or the rendition of services with goods incidental (Bonebrake v. Cox). Here the unit is $38,000 of $44,000.'),
      no('ELEMENT_BOUNDARY_MISS', 'Article 2 for the unit and the common law for the installation, because every hybrid contract must be divided.', 'Most courts apply one body of law to the whole contract based on what predominates. They do not divide every hybrid (Bonebrake v. Cox).'),
      no('MERCHANT_THRESHOLD', 'The common law, because Article 2 governs only contracts between two merchants of the goods involved.', 'Article 2 applies to transactions in goods whether or not the buyer is a merchant (UCC § 2-102). Merchant status matters only for particular rules.'),
    ],
    explanation: 'Article 2 applies to transactions in goods (UCC § 2-102). When a contract mixes goods and services, most courts apply the predominant-purpose test: is the thrust of the contract the sale of goods with services incidental, or the rendition of services with goods incidental (Bonebrake v. Cox)? Here $38,000 of the $44,000 price is the unit, the contract describes a unit “supplied and installed”, and Precision is in the business of selling equipment, so goods predominate and Article 2 governs the whole contract.',
    node_id: 'ucc.hybrid-test', cites: ['UCC § 2-102', 'Bonebrake v. Cox'],
  },
  {
    stem: 'Same facts, except that the contract allocates $9,000 to the equipment and $35,000 to engineering, custom system design and installation labor. Which body of law governs the contract?',
    is_variation: true, parent_index: 0,
    choices: [
      no('CL_VS_UCC', 'Article 2, because the contract still requires Precision to supply a ventilation unit.', 'The presence of some goods does not decide scope. The question is which element predominates (Bonebrake v. Cox).'),
      no('ELEMENT_BOUNDARY_MISS', 'Article 2 for the equipment and the common law for the engineering and installation, applied separately.', 'Most courts pick one body of law for the whole contract according to its predominant purpose (Bonebrake v. Cox) rather than dividing it.'),
      ok('The common law, because the predominant purpose of the contract is now the rendition of engineering and installation services, with the equipment incidental.', 'Correct. With $35,000 of the $44,000 allocated to engineering, design and installation labor, the thrust of the contract is services with goods incidental (Bonebrake v. Cox), so Article 2 does not govern (UCC § 2-102).'),
      no('MERCHANT_THRESHOLD', 'Article 2, because Precision is a merchant of HVAC equipment and Article 2 follows the seller’s business.', 'Merchant status does not decide whether Article 2 applies. Scope turns on whether the transaction is in goods (UCC § 2-102).'),
    ],
    explanation: 'Whether goods or services predominate depends on the thrust of the contract: its language, the allocation of price, the supplier’s business and the relative value of each part (Bonebrake v. Cox; UCC § 2-102). Moving $26,000 of the price from equipment to engineering and installation labor flips the balance, so the contract is predominantly for services and the common law governs. The seller’s merchant status does not decide scope.',
    node_id: 'ucc.hybrid-test', cites: ['Bonebrake v. Cox', 'UCC § 2-102'],
  },
  {
    stem: 'Harbor Hardware and Marlow Properties, both businesses that deal in building supplies, sign a written contract under which Harbor will sell and deliver 40 commercial padlock sets to Marlow for $480. The contract says nothing about modification. Before delivery, Harbor telephones Marlow, explains that its supplier raised its prices by 12 percent, and asks for $495. Marlow orally agrees. Harbor delivers the padlocks, but Marlow pays only $480 and argues that its promise to pay more was not supported by consideration. Is Marlow bound to pay $495?',
    choices: [
      no('CL_VS_UCC', 'No, because Harbor gave no new consideration for the higher price.', 'This applies the common-law preexisting duty rule. For a sale of goods, an agreement modifying the contract needs no consideration (UCC § 2-209(1)).'),
      no('ELEMENT_BOUNDARY_MISS', 'No, because the original contract was in writing, so any modification must also be in writing.', 'There is no no-oral-modification clause, and the contract as modified is $495, below the $500 threshold, so the statute of frauds does not require a writing (UCC § 2-209(3); UCC § 2-201(1)).'),
      no('TIMING_OR_NOTICE', 'Yes, but only if Marlow confirmed the new price in a signed writing within ten days.', 'The ten-day rule concerns a merchant’s written confirmation under the statute of frauds (UCC § 2-201(2)). It is not a condition of a modification that needs no writing.'),
      ok('Yes, because a modification of a contract for goods needs no consideration, Harbor asked for a legitimate commercial reason, and the modified price is below the statute of frauds threshold.', 'Correct. An agreement modifying a contract within Article 2 needs no consideration (UCC § 2-209(1)). A supplier’s cost increase is a legitimate commercial reason, so good faith is met (UCC § 2-209 cmt. 2). At $495, the contract as modified is under $500 (UCC § 2-201(1)).'),
    ],
    explanation: 'Under the UCC, an agreement modifying a contract within Article 2 needs no consideration to be binding (UCC § 2-209(1)), so the preexisting duty rule does not apply. The modification must meet the good-faith test, but a supplier’s cost increase is a legitimate commercial reason (UCC § 2-209 cmt. 2). There is no no-oral-modification clause, and the contract as modified is $495, below the $500 threshold of UCC § 2-201(1), so UCC § 2-209(3) adds no writing requirement.',
    node_id: 'ucc.modification-no-consideration', cites: ['UCC § 2-209(1)', 'UCC § 2-209 cmt. 2', 'UCC § 2-201(1)', 'UCC § 2-209(3)', 'UCC § 2-201(2)'],
  },
  {
    stem: 'Same facts, except that Harbor’s written contract is to maintain the grounds of Marlow’s office park for a season for $480, with no goods involved, and Harbor’s request for $495 is based on rising labor costs. Marlow orally agrees. Harbor performs the full season, but Marlow pays only $480. Is Marlow bound to pay $495?',
    is_variation: true, parent_index: 2,
    choices: [
      no('ELEMENT_BOUNDARY_MISS', 'Yes, because Restatement (Second) of Contracts § 89(a) enforces any modification that is fair and equitable, and a price rise caused by labor costs is fair.', 'Section 89(a) requires circumstances the parties did not anticipate. An ordinary rise in costs under a fixed-price contract is generally a risk the contract already allocated (Restatement (Second) of Contracts § 89).'),
      no('CL_VS_UCC', 'Yes, because a modification needs no consideration if it is made in good faith.', 'That is the rule for goods under UCC § 2-209(1). This is a services contract, so Article 2 does not apply (UCC § 2-102) and the common law requires consideration.'),
      no('TIMING_OR_NOTICE', 'No, because any oral modification of a services contract is barred by the statute of frauds.', 'A season-long grounds contract can be performed within a year, and the UCC $500 rule applies only to goods. The statute of frauds is not the obstacle here.'),
      ok('No, because the preexisting duty rule applies: Harbor promised nothing beyond what it was already bound to do, and an ordinary cost increase is not an unanticipated circumstance.', 'Correct. Services are outside Article 2 (UCC § 2-102), so the common law governs. A promise to do what one is already bound to do is not consideration (Restatement (Second) of Contracts § 73; Alaska Packers’ Ass’n v. Domenico), and an ordinary cost increase does not satisfy § 89(a).'),
    ],
    explanation: 'Services are outside Article 2 (UCC § 2-102), so the common law governs the modification. At common law a modification of an executory contract needs consideration, and a promise to do what one is already bound to do is not consideration (Restatement (Second) of Contracts § 73; Alaska Packers’ Ass’n v. Domenico). Harbor offered nothing new. The exception for unanticipated circumstances (Restatement (Second) of Contracts § 89) requires more than an ordinary rise in costs under a fixed-price contract; compare Angel v. Murray, where the amount of work grew far beyond what the parties expected.',
    node_id: 'cl.preexisting-duty', cites: ['UCC § 2-102', 'Restatement (Second) of Contracts § 73', 'Alaska Packers’ Ass’n v. Domenico', 'Restatement (Second) of Contracts § 89', 'Angel v. Murray', 'UCC § 2-209(1)'],
  },
  {
    stem: 'Lena buys a $450 espresso machine for her kitchen at home from CafeCraft, a retailer of kitchen appliances, on CafeCraft’s standard printed form, which she signs at the bottom. A paragraph in the middle of the form says: “This agreement may be modified only by a writing signed by both parties.” Lena does not sign or initial that paragraph separately. The next day CafeCraft’s sales manager, who has authority to agree to such changes, tells Lena that CafeCraft will add a free milk frother at the same $450 price. Lena agrees. CafeCraft later refuses to deliver the frother, relying on the paragraph. Is CafeCraft bound to provide the frother?',
    choices: [
      no('ELEMENT_BOUNDARY_MISS', 'No, because the oral modification would bring the contract within the statute of frauds.', 'The price remains $450, below the $500 threshold, so the contract as modified is not within UCC § 2-201(1) and UCC § 2-209(3) adds no requirement.'),
      no('MERCHANT_THRESHOLD', 'No, because a signed agreement that excludes oral modification can be modified only by a signed writing.', 'This ignores the separate-signature rule. The clause is on a merchant’s form, and a non-merchant must separately sign it (UCC § 2-209(2)).'),
      ok('Yes. Lena is not a merchant and did not separately sign the clause on CafeCraft’s form, so it does not bar an oral modification; the modification needs no consideration, and the price stays under $500.', 'Correct. Under UCC § 2-209(2), a no-oral-modification clause on a merchant’s form must be separately signed by the other party unless both are merchants (UCC § 2-104(1)). A modification needs no consideration (UCC § 2-209(1)).'),
      no('CL_VS_UCC', 'No, because CafeCraft received no consideration for the frother.', 'That is the common-law preexisting duty rule. A modification of a contract for goods needs no consideration (UCC § 2-209(1)).'),
      no('TIMING_OR_NOTICE', 'Yes, but only because CafeCraft’s promise operates as a waiver that CafeCraft may retract at any time before delivery.', 'The clause does not bar the modification, so the promise is a modification, not just a waiver. Even a waiver is retractable only by reasonable notification and not after material reliance (UCC § 2-209(5)).'),
    ],
    explanation: 'UCC § 2-209(2) makes a signed no-oral-modification clause effective, but if the clause is on a form supplied by a merchant, the other party must separately sign it unless both parties are merchants. CafeCraft is a merchant; Lena is a consumer (see UCC § 2-104(1)), and she did not separately sign the paragraph. The clause therefore cannot bar the oral modification. A modification needs no consideration (UCC § 2-209(1)), and with the price still $450 the contract as modified is below the $500 threshold in UCC § 2-201(1), so UCC § 2-209(3) adds no writing requirement.',
    node_id: 'ucc.nom-clause', cites: ['UCC § 2-209(2)', 'UCC § 2-104(1)', 'UCC § 2-209(1)', 'UCC § 2-201(1)', 'UCC § 2-209(3)', 'UCC § 2-209(5)'],
  },
  {
    stem: 'Same facts, except that Lena runs a business installing and reselling home espresso equipment, and she buys the machine from CafeCraft for resale to a customer. Is CafeCraft bound to provide the frother?',
    is_variation: true, parent_index: 4,
    choices: [
      no('ELEMENT_BOUNDARY_MISS', 'Yes, because a modification of a contract for goods needs no consideration, so the clause’s signed-writing requirement is irrelevant.', 'The absence of a consideration requirement does not remove the clause. Between merchants a no-oral-modification clause is effective without a separate signature (UCC § 2-209(2)).'),
      no('TIMING_OR_NOTICE', 'Yes, because CafeCraft’s promise is a waiver, and a waiver can never be retracted once it is made.', 'A waiver of an executory portion of the contract can be retracted by reasonable notification unless retraction would be unjust in view of material reliance (UCC § 2-209(5)).'),
      no('MERCHANT_THRESHOLD', 'No, because Lena, as a merchant, is held to the clause only if she separately signed it.', 'This reverses the rule. Between merchants no separate signature is required (UCC § 2-209(2)).'),
      no('ELEMENT_BOUNDARY_MISS', 'No, and the oral promise has no legal effect at all, because the clause bars any change that is not in a signed writing.', 'A failed modification may still operate as a waiver (UCC § 2-209(4)), so it is not without legal effect.'),
      ok('Not as a modification. Between merchants the clause is effective without a separate signature, so the oral promise can operate only as a waiver, which CafeCraft may retract by reasonable notification unless Lena has materially changed her position in reliance.', 'Correct. The clause binds without a separate signature between merchants (UCC § 2-209(2); UCC § 2-104(1)). The failed modification can still operate as a waiver (UCC § 2-209(4)), retractable under UCC § 2-209(5) absent material reliance.'),
    ],
    explanation: 'Between merchants, a no-oral-modification clause on a form supplied by a merchant needs no separate signature (UCC § 2-209(2)). Lena now buys in the trade (UCC § 2-104(1)), so the clause is effective and the sales manager’s oral promise does not modify the contract. But an attempted modification that fails UCC § 2-209(2) can still operate as a waiver (UCC § 2-209(4)). CafeCraft may retract the waiver of an executory portion of the contract by reasonable notification that strict performance will be required, unless retraction would be unjust in view of a material change of position by Lena in reliance on the waiver (UCC § 2-209(5)).',
    node_id: 'ucc.waiver-retraction', cites: ['UCC § 2-209(2)', 'UCC § 2-104(1)', 'UCC § 2-209(4)', 'UCC § 2-209(5)'],
  },
];

const ucc = {
  id: 'ucc-hybrid-modification',
  title: 'UCC Hybrid Contracts and § 2-209 Modification + Common-Law Comparison',
  subtitle: 'Goods or services? Then, does a modification need consideration, a writing, a signature? With the common-law mirror image',
  subject_id: 'sales-and-leases',
  subject: {
    title: 'Sales and Leases', ncbe_category: 'Contracts: UCC Article 2 (MBE/MEE)', accent: '#3f6b4a',
    description: 'UCC Article 2 scope and modification, with the common-law comparison the bar exam expects.',
  },
  source_name: 'Sales and Leases, Week 5: lecture notes (excerpt)',
  summary: 'Lecture notes on the scope of Article 2 and on modification under § 2-209, plus the bar-exam comparison to the common-law preexisting duty rule. Compiles into new rules scoped for the course and the bar, an outline with a UCC-versus-common-law table, and questions whose one-fact variations flip the answer.',
  highlights: [
    'Goods vs. services: the predominant-purpose test for hybrid contracts',
    'No consideration needed, good faith, and the $500 statute of frauds line',
    'No-oral-modification clauses and the separate-signature rule for merchants',
    'Waiver and retraction, against the preexisting duty rule and Restatement § 89',
  ],
  material: uccMaterial,
  authorities: uccAuthorities,
  master_nodes: uccNodes,
  student_outline_html: uccOutline,
  questions: uccQuestions,
};

export const PACKETS = [corporate, ucc];
export default PACKETS;
export { slug as packetSlug };
