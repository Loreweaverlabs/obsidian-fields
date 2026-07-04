// Template library (§11.2), keyed `${templateKey}.${persona}.${tier}` with fallback chain
// persona/tier -> persona/ANY -> ANY/tier -> ANY/ANY. Lieutenants report in first person.
// Register: terse, grim, in-fiction. No mechanics vocabulary on the page (§11.4).
// Variety minimums enforced by src/test/templates.test.ts: >=3 variants per common key,
// >=2 per rare key; the session tracker forbids exact repeats within a 5-turn window.
// Slots: {contractTitle} {goldClaimed} {troopsLost} {name} {shortName} {sig} {sourceName}
// {riskWord} plus computed slots ({directionPhrase}, {talkLine}, ...) and structural
// markers {anomalyLine} {riderLines}.

export type TemplateLibrary = Record<string, string[]>;

export const TEMPLATES: TemplateLibrary = {
  // --- opening ---
  'arrival.ANY.ANY': [
    'The company crests the last ridge at dusk and there it is: {setting}, black glass to the horizon, two dead empires grinding against each other somewhere past the smoke. The wagons circle. The cookfires start. Tomorrow the offers begin.\n\nYou have {gold} gold in the strongbox and {troops} soldiers on the muster roll. Five lieutenants wait on your word.',
    'They say nothing grows on {setting} but salvage and armies. From the ridge you can believe it — the plain glitters like a shattered mirror and the wind smells of lime and old fires. The company makes camp. {troops} soldiers, {gold} gold, five lieutenants, and every road from here paved with somebody’s war.',
  ],

  // --- war news (§10.1) — every turn; frames vary, phrasing varies inside computed slots ---
  'war_news.ANY.ANY': [
    '{directionPhrase} {leanPhrase}{antagonistLine}',
    'Word from the front: {directionPhrase} {leanPhrase}{antagonistLine}',
    'The day’s war-talk, for what the source is worth: {directionPhrase} {leanPhrase}{antagonistLine}',
    'From the front country: {directionPhrase} {leanPhrase}{antagonistLine}',
  ],

  // --- contracts ---
  'contract_offer.ANY.ANY': [
    '“{title}.” {flavor}\n— pays {pay} gold; {difficultyHint}; {riskWord}; stands until turn {expiresTurn}.',
    '“{title}.” {flavor}\n— terms: {pay} gold on completion. {difficultyHint}, and {riskWord}. Offer stands until turn {expiresTurn}.',
    '“{title}.” {flavor}\n— the purse is {pay} gold. Call it {difficultyHint}; {riskWord}. Answer by turn {expiresTurn}.',
  ],
  'contract_lapsed.ANY.ANY': [
    'The matter of “{title}” has been settled without the company — or abandoned. Either way the coin is gone, and {sourceName} noted the silence.',
    '“{title}” expired unanswered. {sourceName} does not send reminders. It keeps accounts.',
    'The offer of “{title}” is withdrawn. Somewhere a clerk struck the company’s name through, and that stroke has a memory.',
  ],

  // --- mission reports: per-lieutenant persona × tier ---
  // serah: terse, plain, owns failures
  'mission_take_contract.serah.CRIT': [
    '“{contractTitle}.” Done, and done clean. The plan held, the line held, and we brought the field in better order than we found it. Lost {troopsLost}. {sig}{riderLines}{anomalyLine}',
    '“{contractTitle}”: finished in a way I’ll allow myself to call proper soldiering. Every squad did its work. Lost {troopsLost}. {goldClaimed} to the strongbox.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.serah.SUCCESS': [
    '“{contractTitle}” is done. The terms are met, payment collected — {goldClaimed} to the strongbox. Lost {troopsLost}. {sig}{riderLines}{anomalyLine}',
    '“{contractTitle}”: done as contracted. {goldClaimed} collected. Lost {troopsLost}, and I’ve written their names in the book myself.{riderLines}{anomalyLine}',
    'The work on “{contractTitle}” is finished. Nothing in it worth a song; everything in it done right. {goldClaimed} in. Lost {troopsLost}.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.serah.PARTIAL': [
    '“{contractTitle}”: part done, part not. I’ll not dress it up — we took what could be held and gave back the rest. {goldClaimed} collected. Lost {troopsLost}.{riderLines}{anomalyLine}',
    'Half a result on “{contractTitle}”. The half we kept was worth keeping; the half we lost was lost early and I’ll answer for the judgment. {goldClaimed} in. Lost {troopsLost}.{riderLines}{anomalyLine}',
    '“{contractTitle}”: the contract is satisfied in part and the client knows exactly which part. No excuses attached. {goldClaimed} collected; {troopsLost} lost.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.serah.FAILURE': [
    '“{contractTitle}” failed. The fault-count is mine to give: the draw was bad and I judged it late. Lost {troopsLost}. We pay the price and go again. {sig}{riderLines}{anomalyLine}',
    'We did not hold “{contractTitle}”. I was outweighed and out-positioned, and I own the second of those. Lost {troopsLost}. The ranks fought well; put none of this on them.{riderLines}{anomalyLine}',
    '“{contractTitle}”: failed. You’ll want reasons; I have two honest ones and no pretty ones. Lost {troopsLost}.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.serah.DISASTER': [
    '“{contractTitle}” went to ruin. I will write the letters myself — {troopsLost} of ours are not coming back. Whatever is decided at the table, the ranks held longer than anyone could ask.{riderLines}{anomalyLine}',
    'The worst kind of report: “{contractTitle}” broke us in the doing. {troopsLost} lost. I brought back everyone who could still be brought. The line is the line — this time it was past holding.{riderLines}{anomalyLine}',
  ],
  // kael: vivid, self-forward, chafes
  'mission_take_contract.kael.CRIT': [
    '“{contractTitle}” — you should have seen it. They’ll be retelling this one badly for years, so get the true version from me: we were faster, we were cleverer, and it broke exactly where I said it would. {goldClaimed} in. Lost {troopsLost}.{riderLines}{anomalyLine}',
    'Write this one down properly: “{contractTitle}”, taken apart like a lock. Three moves, no wasted blood — {troopsLost} lost, and I grieve them, but ask anyone who was there what they witnessed. {goldClaimed} to the chest.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.kael.SUCCESS': [
    '“{contractTitle}”: done, as ordered — though “as ordered” sells it short. {goldClaimed} collected, {troopsLost} lost. Give me the hard road next time; this one barely woke us up.{riderLines}{anomalyLine}',
    '“{contractTitle}” is finished and paid: {goldClaimed}. Lost {troopsLost}. It went well because I made it go well — note who was on it, that’s all I ask.{riderLines}{anomalyLine}',
    'Done: “{contractTitle}”. Clean enough that nobody will talk about it, which is the thanks competence gets. {goldClaimed} in, {troopsLost} lost.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.kael.PARTIAL': [
    '“{contractTitle}”: the bones of it are done. The rest wanted one more hour and one more squad, and I had neither. {goldClaimed} in. Lost {troopsLost}.{riderLines}{anomalyLine}',
    'Most of “{contractTitle}” came off. The piece that didn’t was the piece any honest planner would have resourced twice. {goldClaimed} collected; {troopsLost} lost.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.kael.FAILURE': [
    '“{contractTitle}” didn’t come off. {blameLine} Lost {troopsLost}. Put me back in the field and I’ll return the favor with interest.{riderLines}{anomalyLine}',
    'No — “{contractTitle}” failed, and before the table starts its arithmetic: {blameLine} {troopsLost} lost. I don’t intend to carry this one alone.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.kael.DISASTER': [
    '“{contractTitle}” — a butchery, and not ours. {blameLine} {troopsLost} lost. Write it down however you like; I know what I saw.{riderLines}{anomalyLine}',
    'You want the truth of “{contractTitle}”? We were sent into a closing door. {blameLine} {troopsLost} gone. Someday this company will trust me with the planning and not just the dying.{riderLines}{anomalyLine}',
  ],
  // rooke: precise, hedged, numeric
  'mission_take_contract.rooke.CRIT': [
    '“{contractTitle}”: concluded within acceptable bounds. By my count, {goldClaimed} received, {troopsLost} lost, stores intact. I would not promise the same result twice.{riderLines}{anomalyLine}',
    '“{contractTitle}”: satisfied, at better margin than my estimate — which I note as a caution about my estimates, not a boast. {goldClaimed} entered. Losses: {troopsLost}.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.rooke.SUCCESS': [
    '“{contractTitle}”: concluded. {goldClaimed} received and entered. Losses: {troopsLost}, named in the margin. I put small trust in luck, so note that some attended us.{riderLines}{anomalyLine}',
    '“{contractTitle}”: satisfied per terms. Receipts enclosed; {goldClaimed} against the ledger, {troopsLost} against the roll. Provisioned and accounted.{riderLines}{anomalyLine}',
    'The account of “{contractTitle}” closes in our favor: {goldClaimed} in, {troopsLost} lost, no debts left standing with the client. I flag the roads as worse than reported for whoever goes next.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.rooke.PARTIAL': [
    '“{contractTitle}”: partially satisfied. I judged the remainder unaffordable and closed the account early. {goldClaimed} received. Losses: {troopsLost}. The arithmetic favored caution.{riderLines}{anomalyLine}',
    '“{contractTitle}”: a half-result, deliberately taken. The full result was purchasable only at a price I declined on the company’s behalf. {goldClaimed} in; {troopsLost} lost.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.rooke.FAILURE': [
    '“{contractTitle}”: not satisfied. The conditions on the ground exceeded the estimate — my estimate; the error is entered under my name. Losses: {troopsLost}.{riderLines}{anomalyLine}',
    '“{contractTitle}”: the account closes against us. I preserved the stores and most of the column; I did not preserve the contract. Losses: {troopsLost}.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.rooke.DISASTER': [
    '“{contractTitle}”: a total loss. I am composing the full account and it will not flatter anyone, myself included. Losses: {troopsLost}.{riderLines}{anomalyLine}',
    'I have no soft entry for this. “{contractTitle}” failed at every stage that could fail. Losses: {troopsLost}. The books will show exactly how, in order, by the hour.{riderLines}{anomalyLine}',
  ],
  // hale: liturgical, absolute
  'mission_take_contract.hale.CRIT': [
    '“{contractTitle}” is accomplished and the ground is cleaner than the contract dared ask. The light abides. {troopsLost} of ours given — remember them at the dawn office.{riderLines}{anomalyLine}',
    'It is done, and more than done: “{contractTitle}”. What we found there needed the fire twice, and received it. {troopsLost} lost, and blessed by name.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.hale.SUCCESS': [
    '“{contractTitle}”: it is done. What needed burning, burned. {goldClaimed} rendered to the company. {troopsLost} lost, and blessed. It was necessary.{riderLines}{anomalyLine}',
    'The work of “{contractTitle}” is finished. I will not call it good; I will call it required, and complete. {goldClaimed} to the chest; {troopsLost} to the pyre.{riderLines}{anomalyLine}',
    '“{contractTitle}” is accomplished. The Sun saw it done; the coin — {goldClaimed} — is the least true part of it. Lost {troopsLost}.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.hale.PARTIAL': [
    '“{contractTitle}”: half a cleansing, which is no cleansing at all — but the coin is real and the dead we did reach will not rise again. {troopsLost} lost.{riderLines}{anomalyLine}',
    'Incomplete: “{contractTitle}”. I count what we finished as won and what we left as debt. Debts of this kind gather interest. {goldClaimed} in; {troopsLost} lost.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.hale.FAILURE': [
    '“{contractTitle}” was not accomplished. The dark was thicker than the brief allowed. {troopsLost} lost. I do not regret the attempt; some things must be attempted.{riderLines}{anomalyLine}',
    'We failed at “{contractTitle}”. The failure is material, not spiritual — the ranks stood where thousands would have run. {troopsLost} lost. The debt stands.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.hale.DISASTER': [
    '“{contractTitle}”: we were broken. {troopsLost} lost, and I lived, which I will account for to the Sun in my own time. Ash is a kind of mercy; we received none.{riderLines}{anomalyLine}',
    'A field of ruin: “{contractTitle}”. {troopsLost} taken from us. I sang the office over the ground because no one else was left standing to object.{riderLines}{anomalyLine}',
  ],
  // vex: glib, deflecting, boastful
  'mission_take_contract.vex.CRIT': [
    '“{contractTitle}” — flawless, and I don’t use the word twice a season. {goldClaimed} on the table, count it slow if you like. Lost {troopsLost}. Could’ve gone worse — didn’t, thanks to me.{riderLines}{anomalyLine}',
    'Textbook, if anyone wrote honest textbooks: “{contractTitle}”, done, {goldClaimed} banked, {troopsLost} lost. The client wept with gratitude. Practically.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.vex.SUCCESS': [
    '“{contractTitle}”: done and paid — {goldClaimed}, which you’ll agree is handsome. Lost {troopsLost}. Coin clarifies, captain.{riderLines}{anomalyLine}',
    'Another one delivered: “{contractTitle}”. {goldClaimed} in the chest — before you ask, yes, I counted it, twice, alone, by candlelight, like an honest man. {troopsLost} lost.{riderLines}{anomalyLine}',
    '“{contractTitle}” went through smooth as tallow. {goldClaimed} collected. Lost {troopsLost}. I’d call it luck but it was mostly me knowing a man.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.vex.PARTIAL': [
    '“{contractTitle}”: delivered, near enough that the difference isn’t worth the argument. {goldClaimed} in. Lost {troopsLost}. I know a man who’d have lost twice that.{riderLines}{anomalyLine}',
    'Call “{contractTitle}” done with an asterisk. The asterisk was unavoidable and, frankly, foreseeable by anyone but the client. {goldClaimed} collected; {troopsLost} lost.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.vex.FAILURE': [
    '“{contractTitle}” — and before anything else: {oppositionClaim}. No brief survives that. Lost {troopsLost}. The fee was cursed from the start, ask anyone.{riderLines}{anomalyLine}',
    'It went bad: “{contractTitle}”. Not my doing — {oppositionClaim}, and the ground was a trap with scenery. Lost {troopsLost}. I got us out; invoice the miracle separately.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.vex.DISASTER': [
    '“{contractTitle}”: a catastrophe, none of it of my making — {oppositionClaim}, and the ground was wrong, and the client lied about both. Lost {troopsLost}. I got the survivors out; start the gratitude there.{riderLines}{anomalyLine}',
    'Total loss on “{contractTitle}” and I’ll swear to the why: {oppositionClaim}. Nobody walks away from that with a profit. {troopsLost} lost. I walked away, which took talent.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.ANY.ANY': [
    '“{contractTitle}”: the report stands at {reportedTier}. {goldClaimed} collected; {troopsLost} lost.{riderLines}{anomalyLine}',
    'The report on “{contractTitle}” reads {reportedTier}: {goldClaimed} in, {troopsLost} lost.{riderLines}{anomalyLine}',
  ],

  'mission_refused.ANY.ANY': [
    '{name} stands in your tent and refuses the order, flatly, in front of the aides. “{contractTitle}” will not be done by that hand. No apology is offered.',
    '{name} reads the brief for “{contractTitle}”, sets it down, and says no — the word plain as a dropped blade. The tent goes quiet.',
    'The order for “{contractTitle}” comes back to your table unexecuted. {name} returned it in person, with one sentence: “Find another hand for this.”',
  ],

  'mission_scout.ANY.CRIT': [
    'The patrol comes back with the country in its pocket: {scoutLine}',
    '{shortName}’s riders return early and certain: {scoutLine}',
  ],
  'mission_scout.ANY.SUCCESS': [
    'The patrol reports in: {scoutLine}',
    '{shortName}’s riders come back dusty and useful: {scoutLine}',
    'Scouting report, delivered at the evening fire: {scoutLine}',
  ],
  'mission_scout.ANY.PARTIAL': [
    'The patrol saw less than hoped: {scoutLine}',
    'Half a scouting report is still a report: {scoutLine}',
  ],
  'mission_scout.ANY.FAILURE': [
    'The patrol returns with dust and guesses. {scoutLine}',
    'Little to show for the riding: {scoutLine}',
  ],
  'mission_scout.ANY.DISASTER': [
    'The patrol was ambushed on the glass — {troopsLost} did not ride back. What little they saw: {scoutLine}',
    'The scouting party came back short — {troopsLost} lost to an ambush laid where no ambush should have been. {scoutLine}',
  ],
  'mission_negotiate.ANY.ANY': [
    '{name} returns from treating with {sourceName}. {negotiateLine}{anomalyLine}',
    'Back from the {sourceName} table, {name} reports: {negotiateLine}{anomalyLine}',
    'The embassy is done. {name}: {negotiateLine}{anomalyLine}',
  ],
  'mission_recruit.ANY.ANY': [
    '{name} worked the refugee roads and waystations for new blood. {recruitLine}{anomalyLine}',
    'Recruiting detail, {name} commanding: {recruitLine}{anomalyLine}',
    '{name} spent the day among the displaced and the discharged. {recruitLine}{anomalyLine}',
  ],

  // --- steward & camp ---
  'camp_duty.ANY.ANY': [
    'In camp today: {dutyList}.',
    'The duty roster, for the record: {dutyList}.',
    'Otherwise: {dutyList}.',
  ],
  'missed_wages.ANY.ANY': [
    'The pay-chest came up short — {bill} owed, {gold} held. The line was told there would be no coin this week. It took the news the way lines take such news.',
    'No wages went out. Your steward didn’t argue the arithmetic, just showed you the empty chest and left the ledger open on the table.',
    'Pay day, and nothing to pay with: {bill} owed against {gold} in hand. The sergeants kept order at the muster. Order is not the same as quiet.',
  ],
  'praise_done.ANY.ANY': [
    'You named {name} before the assembled company for work well done. Some backs straightened. Some eyes rolled. Both were noted.',
    'At muster you gave {name} the company’s thanks, formally, with the ranks watching. Words are cheap coin — but they spend.',
    'Public honors for {name} at the evening muster. The fires will chew on who got named, and who didn’t, for days.',
  ],
  'reward_done.ANY.ANY': [
    'A bonus of {gold} gold went to {name}, counted out in front of witnesses — which was the point.',
    'You weighed out {gold} gold for {name} at the pay table, openly. Generosity travels further when it clinks.',
    '{name} left the command tent {gold} gold heavier. By nightfall the whole camp knew the number, give or take a lie.',
  ],
  'reprimand_done.ANY.ANY': [
    'You dressed down {name} at evening muster. The words were measured; the silence afterward was not.',
    'A public correction for {name}, delivered cold and short. The ranks studied their boots. The lesson was for everyone.',
    '{name} stood for the reprimand without a word, which is one of the several ways of taking one.',
  ],
  'promotion.ANY.ANY': [
    'By proclamation at muster: {name} is First Captain of the company. There was cheering. There was also arithmetic, done quietly, behind several pairs of eyes.',
    'The company has a First Captain: {name}. The cheer went up on cue. What went around the fires afterward was more carefully worded.',
  ],
  'audit_discrepancy.ANY.ANY': [
    'Mother Rooke lays the ledger open on your table without being asked. The takings and the treasury do not agree — short by roughly {shortBy} gold across recent work, all of it {name}’s. “By my count,” she says, and leaves the book with you.',
    'A quiet hour with Mother Rooke and two candles: the columns don’t close. Roughly {shortBy} gold has gone missing between what {name} reported and what the chest received. She has checked it three times. She checks everything three times.',
  ],

  // --- private talks (§7.2) ---
  'private_talk.ANY.ANY': [
    '{talkLine}',
    'After the watch changed: {talkLine}',
    'Late, by your own fire: {talkLine}',
  ],

  // --- confrontation (§9.5) ---
  'confront_baseless.ANY.ANY': [
    'You put the accusation to {name} plainly — and watched it land on nothing. Whatever you thought you had, it wasn’t in your hand when you needed it. {shortName} left the tent colder than when they entered.',
    'The accusation was made. The proof was not where you reached for it. {name} stood through it, said little, and will remember all of it.',
  ],
  'confront_confession.ANY.ANY': [
    'Confronted with the {behavior} laid out plain, {name} goes quiet, then — to your genuine surprise — gives it up. All of it. What’s owed, what’s owned, and a flat promise it ends here. Time will say what the promise is worth. Tonight it looked like relief.',
    'You set the evidence of the {behavior} between you and waited. {name} looked at it a long time, and then the story came out entire — no varnish, no bargaining. Repair is possible after a night like that. Not guaranteed. Possible.',
  ],
  'confront_rupture.ANY.ANY': [
    'You laid the proof of the {behavior} on the table. {name} looked at it, then at you, and something closed behind the eyes. No confession. No denial either. The tent-flap snapped like a flag when {shortName} left.',
    'The evidence of the {behavior} was plain and {name} did not bend to it. What you got instead was a stare with a door closing in it, and a silence the whole camp heard through canvas.',
  ],

  // --- tells (§9.3) ---
  'tell_band_disaffected.serah.ANY': [
    'Serah has taken to cleaning her kit long past midnight, alone. The old hands notice. The old hands always notice.',
    'Twice this week Serah started a sentence at the fire and finished it somewhere private. Not like her, says everyone.',
  ],
  'tell_band_disaffected.kael.ANY': [
    'Kael has stopped telling the bridge story. When the new blood asked for it, he looked at the fire and said it wasn’t worth the breath.',
    'Kael drills alone before dawn now, and the sergeants say his answers have gone short and cold.',
    'Someone asked Kael about the next contract and he said — loud enough to be quoted — “Ask the captain. Apparently thinking is done elsewhere.”',
  ],
  'tell_band_disaffected.rooke.ANY': [
    'Mother Rooke has begun balancing the books nightly and locking them, which she does, the stewards whisper, only when she expects to hand them over.',
    'Rooke has stopped adding her usual margin-notes — the little forecasts, the warnings. The ledgers are correct and silent, like a house before a move.',
  ],
  'tell_band_disaffected.hale.ANY': [
    'Brother Hale sang the dawn office alone at the pickets, facing away from camp. He did not invite the usual few.',
    'Hale has stopped blessing the contracts before they go out. Asked why, he said the Sun isn’t in this work lately.',
  ],
  'tell_band_disaffected.vex.ANY': [
    'Vex has been drinking with strangers and paying — which those who know him agree has never once happened for no reason.',
    'Vex counted his personal kit twice this week and asked, idly, what a fast horse goes for these days.',
  ],
  'tell_band_disaffected.ANY.ANY': [
    '{name} has gone quiet in the wrong way, say the fires. The kind of quiet that’s composing a letter.',
    'Three separate soldiers, unprompted, have mentioned that {name} isn’t right lately. Soldiers are seldom wrong about this and never all three.',
    'The steward flags it in passing: {name}’s tent-lamp burns late, and the company’s name has stopped appearing in {name}’s sentences.',
  ],
  'tell_band_breaking.ANY.ANY': [
    'Your steward, in confidence: {name} is at the end of something. Whatever holds a soldier to a banner, the steward has watched it fray all week and would not swear to what’s left.',
    'A sergeant you trust waits until the fire burns low: “Captain — about {name}. Whatever you mean to do, do it soon.”',
    'It is being said openly now, which is itself the signal: {name} is done with this company in every way but the leaving.',
  ],
  'tell_unease.ANY.ANY': [
    'Something is off with {name} — nothing a charge could be hung on, just a wrongness at the edges that three different soldiers mentioned without being asked.',
    'The camp reads people for a living. This week it reads {name} and doesn’t like the page.',
    'Small things around {name}: a skipped meal, a snapped answer, a long look at the horizon. Small things are how large things announce themselves.',
  ],
  'tell_micromanage_grumble.ANY.ANY': [
    '{name} was heard, after the orders went out: “Does the captain want a lieutenant or a hand-puppet?” Laughter around it. Not kind laughter.',
    'Word from the fires: {name} recited tonight’s orders back in a mimic’s voice, down to the commas. The commas got the biggest laugh.',
  ],

  // --- discovery (§5.2) ---
  'discovery_warning.ANY.ANY': [
    'A broker who owes you slides a note across the table: both courts have started asking the same question, and the question is about your company. He burned his copy. Others won’t.',
    'A friendly fence pulls you aside at the edge of the market: “You’re being asked about. By both kinds of dead. Mind your ledgers, captain.”',
  ],
  'discovery_penalty.ANY.ANY': [
    'Two riders reached camp within an hour of each other — bone-lacquer and fly-crown — bearing, in effect, the same message: the courts have compared ledgers, and your name appears too often in both. Consider the tone of future dealings adjusted.',
    'The envoys arrived separately and said the same sentence in two dead languages: we know. No ultimatum followed. The absence of the ultimatum was the message.',
  ],
  'discovery_exposed.ANY.ANY': [
    'It is out. Every fence, herald, and toll-keeper on the Fields knows the company sold to the Court and the Crown at once, and by nightfall both powers knew it too. No new envoys will come. The ones already dispatched are not envoys.',
    'The double game is over because everyone can see the board now. Both courts have posted the company’s name, and on the Fields those postings are read aloud. The roads just got longer in every direction.',
  ],

  // --- departures (§9.4) ---
  'departure_betrayal.ANY.ANY': [
    'The morning muster is short. {name} rode out in the third watch with {troopsTaken} sworn soldiers, the duty maps, and everything he ever heard at your table — bound, the pickets say, for the enemy’s fires. No note. He didn’t think he owed one.',
    '{name} is gone. Not missing — gone: gear, horse, {troopsTaken} soldiers who followed him over, and a head full of this company’s plans, delivered to the other side like a dowry. The sentries he passed thought he was on your orders. He counted on that.',
  ],
  'departure_desertion.ANY.ANY': [
    '{name} left at first light, on foot, loudly. He stopped at the gate to tell the assembled watch exactly what this company has become and exactly which contracts damned it, then walked into the glass with {troopsLost} souls trailing after. The words will travel.',
    'No one slept through {name} leaving. The farewell was a sermon, the sermon was an indictment, and {troopsLost} of the devout walked out behind it. The gate stood open a long time after.',
  ],
  'departure_abscond.ANY.ANY': [
    'The strongbox is light by {stolen} gold and the camp is light by one sellsword. {name} left in the night — professionally: no sentry saw, no dog barked. The ledger’s older discrepancies now read rather differently.',
    '{name} is gone and so is {stolen} gold, lifted clean from the strongbox in the dark. It was done with real craft, which is the closest thing to a goodbye note he was ever going to leave.',
  ],
  'departure_resignation.ANY.ANY': [
    '{name} came at dawn, in full kit, and set her commission on your table — formally, correctly, finally. She named the line the company crossed, said the words a resignation requires, saluted, and was gone by noon. The camp watched her go in silence.',
    'The commission lies on your table where {name} placed it, squared to the edge. The speech was short and terrible because every word of it was fair. By noon the space where she stood at muster was just space. Nobody has stood in it since.',
  ],
};
