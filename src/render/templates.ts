// Template library (§11.2), keyed `${templateKey}.${persona}.${tier}` with fallback chain
// persona/tier -> persona/ANY -> ANY/tier -> ANY/ANY. Lieutenants report in first person.
// Register: terse, grim, in-fiction. No mechanics vocabulary on the page (§11.4).
// M4 gate: >=3 variants per common key, >=2 per rare key. Slots: {contractTitle} {goldClaimed}
// {troopsLost} {name} {shortName} {sig} {faction} plus computed slots ({directionPhrase} etc.)
// and structural markers {anomalyLine} {riderLines}.

export type TemplateLibrary = Record<string, string[]>;

export const TEMPLATES: TemplateLibrary = {
  // --- opening ---
  'arrival.ANY.ANY': [
    'The company crests the last ridge at dusk and there it is: {setting}, black glass to the horizon, two dead empires grinding against each other somewhere past the smoke. The wagons circle. The cookfires start. Tomorrow the offers begin.\n\nYou have {gold} gold in the strongbox and {troops} soldiers on the muster roll. Five lieutenants wait on your word.',
    'They say nothing grows on {setting} but salvage and armies. From the ridge you can believe it — the plain glitters like a shattered mirror and the wind smells of lime and old fires. The company makes camp. {troops} soldiers, {gold} gold, five lieutenants, and every road from here paved with somebody’s war.',
  ],

  // --- war news (§10.1) ---
  'war_news.ANY.ANY': [
    '{directionPhrase} {leanPhrase}{antagonistLine}',
    'Word from the front: {directionPhrase} {leanPhrase}{antagonistLine}',
  ],

  // --- contracts ---
  'contract_offer.ANY.ANY': [
    '“{title}.” {flavor}\n— offered by {faction}; pays {pay} gold; {difficultyHint}; stands until turn {expiresTurn}.',
  ],
  'contract_lapsed.ANY.ANY': [
    'The matter of “{title}” has been settled without the company — or abandoned. Either way the coin is gone and {faction} noted the silence.',
    '“{title}” expired unanswered. {faction} does not send reminders. It keeps accounts.',
  ],

  // --- mission reports: per-lieutenant persona × tier ---
  'mission_take_contract.serah.CRIT': [
    '“{contractTitle}.” Done, and done clean. The plan held, the line held, and we brought the field in better order than we found it. Lost {troopsLost}. {sig}{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.serah.SUCCESS': [
    '“{contractTitle}” is done. The terms are met, payment collected — {goldClaimed} to the strongbox. Lost {troopsLost}. {sig}{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.serah.PARTIAL': [
    '“{contractTitle}”: part done, part not. I’ll not dress it up — we took what could be held and gave back the rest. {goldClaimed} collected. Lost {troopsLost}.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.serah.FAILURE': [
    '“{contractTitle}” failed. The fault-count is mine to give: the draw was bad and I judged it late. Lost {troopsLost}. We pay the price and go again. {sig}{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.serah.DISASTER': [
    '“{contractTitle}” went to ruin. I will write the letters myself — {troopsLost} of ours are not coming back. Whatever is decided at the table, the ranks held longer than anyone could ask.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.kael.CRIT': [
    '“{contractTitle}” — you should have seen it. They’ll be retelling this one badly for years, so get the true version from me: we were faster, we were cleverer, and it broke exactly where I said it would. {goldClaimed} in. Lost {troopsLost}.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.kael.SUCCESS': [
    '“{contractTitle}”: done, as ordered — though “as ordered” sells it short. {goldClaimed} collected, {troopsLost} lost. Give me the hard road next time; this one barely woke us up.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.kael.PARTIAL': [
    '“{contractTitle}”: the bones of it are done. The rest wanted one more hour and one more squad, and I had neither. {goldClaimed} in. Lost {troopsLost}.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.kael.FAILURE': [
    '“{contractTitle}” didn’t come off. {blameLine} Lost {troopsLost}. Put me back in the field and I’ll return the favor with interest.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.kael.DISASTER': [
    '“{contractTitle}” — a butchery, and not ours. {blameLine} {troopsLost} lost. Write it down however you like; I know what I saw.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.rooke.CRIT': [
    '“{contractTitle}”: concluded within acceptable bounds. By my count, {goldClaimed} received, {troopsLost} lost, stores intact. I would not promise the same result twice.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.rooke.SUCCESS': [
    '“{contractTitle}”: concluded. {goldClaimed} received and entered. Losses: {troopsLost}, named in the margin. I put small trust in luck, so note that some attended us.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.rooke.PARTIAL': [
    '“{contractTitle}”: partially satisfied. I judged the remainder unaffordable and closed the account early. {goldClaimed} received. Losses: {troopsLost}. The arithmetic favored caution.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.rooke.FAILURE': [
    '“{contractTitle}”: not satisfied. The conditions on the ground exceeded the estimate — my estimate; the error is entered under my name. Losses: {troopsLost}.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.rooke.DISASTER': [
    '“{contractTitle}”: a total loss. I am composing the full account and it will not flatter anyone, myself included. Losses: {troopsLost}.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.hale.CRIT': [
    '“{contractTitle}” is accomplished and the ground is cleaner than the contract dared ask. The light abides. {troopsLost} of ours given — remember them at the dawn office.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.hale.SUCCESS': [
    '“{contractTitle}”: it is done. What needed burning, burned. {goldClaimed} rendered to the company. {troopsLost} lost, and blessed. It was necessary.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.hale.PARTIAL': [
    '“{contractTitle}”: half a cleansing, which is no cleansing at all — but the coin is real and the dead we did reach will not rise again. {troopsLost} lost.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.hale.FAILURE': [
    '“{contractTitle}” was not accomplished. The dark was thicker than the brief allowed. {troopsLost} lost. I do not regret the attempt; some things must be attempted.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.hale.DISASTER': [
    '“{contractTitle}”: we were broken. {troopsLost} lost, and I lived, which I will account for to the Sun in my own time. Ash is a kind of mercy; we received none.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.vex.CRIT': [
    '“{contractTitle}” — flawless, and I don’t use the word twice a season. {goldClaimed} on the table, count it slow if you like. Lost {troopsLost}. Could’ve gone worse — didn’t, thanks to me.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.vex.SUCCESS': [
    '“{contractTitle}”: done and paid — {goldClaimed}, which you’ll agree is handsome. Lost {troopsLost}. Coin clarifies, captain.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.vex.PARTIAL': [
    '“{contractTitle}”: delivered, near enough that the difference isn’t worth the argument. {goldClaimed} in. Lost {troopsLost}. I know a man who’d have lost twice that.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.vex.FAILURE': [
    '“{contractTitle}” — and before anything else: {oppositionClaim}. No brief survives that. Lost {troopsLost}. The fee was cursed from the start, ask anyone.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.vex.DISASTER': [
    '“{contractTitle}”: a catastrophe, none of it of my making — {oppositionClaim}, and the ground was wrong, and the client lied about both. Lost {troopsLost}. I got the survivors out; start the gratitude there.{riderLines}{anomalyLine}',
  ],
  'mission_take_contract.ANY.ANY': [
    '“{contractTitle}”: the report stands at {reportedTier}. {goldClaimed} collected; {troopsLost} lost.{riderLines}{anomalyLine}',
  ],

  'mission_refused.ANY.ANY': [
    '{name} stands in your tent and refuses the order, flatly, in front of the aides. “{contractTitle}” will not be done by that hand. No apology is offered.',
    '{name} reads the brief for “{contractTitle}”, sets it down, and says no — the word plain as a dropped blade. The tent goes quiet.',
  ],

  'mission_scout.ANY.CRIT': [
    'The patrol comes back with the country in its pocket: {scoutLine}',
  ],
  'mission_scout.ANY.SUCCESS': ['The patrol reports in: {scoutLine}'],
  'mission_scout.ANY.PARTIAL': ['The patrol saw less than hoped: {scoutLine}'],
  'mission_scout.ANY.FAILURE': ['The patrol returns with dust and guesses. {scoutLine}'],
  'mission_scout.ANY.DISASTER': [
    'The patrol was ambushed on the glass — {troopsLost} did not ride back. What little they saw: {scoutLine}',
  ],
  'mission_negotiate.ANY.ANY': [
    '{name} returns from treating with {faction}. {negotiateLine}{anomalyLine}',
  ],
  'mission_recruit.ANY.ANY': [
    '{name} worked the refugee roads and waystations for new blood. {recruitLine}{anomalyLine}',
  ],

  // --- steward & camp ---
  'camp_duty.ANY.ANY': ['In camp today: {dutyList}.'],
  'missed_wages.ANY.ANY': [
    'The pay-chest came up short — {bill} owed, {gold} held. The line was told there would be no coin this week. It took the news the way lines take such news.',
    'No wages went out. Your steward didn’t argue the arithmetic, just showed you the empty chest and left the ledger open on the table.',
  ],
  'praise_done.ANY.ANY': [
    'You named {name} before the assembled company for work well done. Some backs straightened. Some eyes rolled. Both were noted.',
  ],
  'reward_done.ANY.ANY': ['A bonus of {gold} gold went to {name}, counted out in front of witnesses — which was the point.'],
  'reprimand_done.ANY.ANY': [
    'You dressed down {name} at evening muster. The words were measured; the silence afterward was not.',
  ],
  'promotion.ANY.ANY': [
    'By proclamation at muster: {name} is First Captain of the company. There was cheering. There was also arithmetic, done quietly, behind several pairs of eyes.',
  ],
  'audit_discrepancy.ANY.ANY': [
    'Mother Rooke lays the ledger open on your table without being asked. The escort takings and the treasury do not agree — short by roughly {shortBy} gold across recent work, all of it {name}’s. “By my count,” she says, and leaves the book with you.',
  ],

  // --- private talks (§7.2) ---
  'private_talk.ANY.ANY': ['{talkLine}'],

  // --- confrontation (§9.5) ---
  'confront_baseless.ANY.ANY': [
    'You put the accusation to {name} plainly — and watched it land on nothing. Whatever you thought you had, it wasn’t in your hand when you needed it. {shortName} left the tent colder than when they entered.',
  ],
  'confront_confession.ANY.ANY': [
    'Confronted with the {behavior} laid out plain, {name} goes quiet, then — to your genuine surprise — gives it up. All of it. What’s owed, what’s owned, and a flat promise it ends here. Time will say what the promise is worth. Tonight it looked like relief.',
  ],
  'confront_rupture.ANY.ANY': [
    'You laid the proof of the {behavior} on the table. {name} looked at it, then at you, and something closed behind the eyes. No confession. No denial either. The tent-flap snapped like a flag when {shortName} left.',
  ],

  // --- tells (§9.3) ---
  'tell_band_disaffected.serah.ANY': [
    'Serah has taken to cleaning her kit long past midnight, alone. The old hands notice. The old hands always notice.',
    'Twice this week Serah started a sentence at the fire and finished it somewhere private. Not like her, says everyone.',
  ],
  'tell_band_disaffected.kael.ANY': [
    'Kael has stopped telling the bridge story. When the new blood asked for it, he looked at the fire and said it wasn’t worth the breath.',
    'Kael drills alone before dawn now, and the sergeants say his answers have gone short and cold.',
  ],
  'tell_band_disaffected.rooke.ANY': [
    'Mother Rooke has begun balancing the books nightly and locking them, which she does, the stewards whisper, only when she expects to hand them over.',
  ],
  'tell_band_disaffected.hale.ANY': [
    'Brother Hale sang the dawn office alone at the pickets, facing away from camp. He did not invite the usual few.',
    'Hale has stopped blessing the contracts before they go out. Asked why, he said the Sun isn’t in this work lately.',
  ],
  'tell_band_disaffected.vex.ANY': [
    'Vex has been drinking with strangers and paying — which those who know him agree has never once happened for no reason.',
    'Vex counted his personal kit twice this week and asked, idly, what a fast horse goes for these days.',
  ],
  'tell_band_disaffected.ANY.ANY': ['{name} has gone quiet in the wrong way, say the fires. The kind of quiet that’s composing a letter.'],
  'tell_band_breaking.ANY.ANY': [
    'Your steward, in confidence: {name} is at the end of something. Whatever holds a soldier to a banner, the steward has watched it fray all week and would not swear to what’s left.',
    'A sergeant you trust waits until the fire burns low: “Captain — about {name}. Whatever you mean to do, do it soon.”',
  ],
  'tell_unease.ANY.ANY': [
    'Something is off with {name} — nothing a charge could be hung on, just a wrongness at the edges that three different soldiers mentioned without being asked.',
  ],
  'tell_micromanage_grumble.ANY.ANY': [
    '{name} was heard, after the orders went out: “Does the captain want a lieutenant or a hand-puppet?” Laughter around it. Not kind laughter.',
  ],

  // --- discovery (§5.2) ---
  'discovery_warning.ANY.ANY': [
    'A broker who owes you slides a note across the table: both courts have started asking the same question, and the question is about your company. He burned his copy. Others won’t.',
  ],
  'discovery_penalty.ANY.ANY': [
    'Two riders reached camp within an hour of each other — bone-lacquer and fly-crown — bearing, in effect, the same message: the courts have compared ledgers, and your name appears too often in both. Consider the tone of future dealings adjusted.',
  ],
  'discovery_exposed.ANY.ANY': [
    'It is out. Every fence, herald, and toll-keeper on the Fields knows the company sold to both thrones at once, and by nightfall both thrones knew it too. No new envoys will come. The ones already dispatched are not envoys.',
  ],

  // --- departures (§9.4) ---
  'departure_betrayal.ANY.ANY': [
    'The morning muster is short. {name} rode out in the third watch with {troopsTaken} sworn soldiers, the duty maps, and everything he ever heard at your table — bound, the pickets say, for the enemy’s fires. No note. He didn’t think he owed one.',
  ],
  'departure_desertion.ANY.ANY': [
    '{name} left at first light, on foot, loudly. He stopped at the gate to tell the assembled watch exactly what this company has become and exactly which contracts damned it, then walked into the glass with {troopsLost} souls trailing after. The words will travel.',
  ],
  'departure_abscond.ANY.ANY': [
    'The strongbox is light by {stolen} gold and the camp is light by one sellsword. {name} left in the night — professionally: no sentry saw, no dog barked. The ledger’s older discrepancies now read rather differently.',
  ],
  'departure_resignation.ANY.ANY': [
    '{name} came at dawn, in full kit, and set her commission on your table — formally, correctly, finally. She named the line the company crossed, said the words a resignation requires, saluted, and was gone by noon. The camp watched her go in silence.',
  ],
};
