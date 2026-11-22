/* Seed data for the local prototype.
 * Ideas from marketing/content-system/ideas.md and their story cards; all 18 takes from takes.md;
 * the story bank from story-bank.md. Missing fields are filled in and marked drafted.
 * Privacy: no client names, client file paths or keys. Client stories stay blinded.
 * Past weeks (Nov 9, Nov 16) are example rows until the real history is migrated (stage E). */
import { DEFAULT_CHANNELS, type Beat, type Data, type Hook, type Idea, type Look, type ScriptLine } from './types';
import { CUR_WEEK } from './dates';

const H = (spoken: string, onscreen: string, frame: string, format: string, payoff: string, rec = false): Hook => ({ spoken, onscreen, frame, format, payoff, rec });
const L = (setup: string, outfit: string, location: string, props: string, edit: string): Look => ({ setup, outfit, location, props, edit });
const S = (t: string, d = false, g?: string): ScriptLine => (g ? { t, d, g } : { t, d });
const G = (t: string, gap: string): Beat => ({ t, gap });
const W = (t: string, waitingOn: string): Beat => ({ t, waitingOn });
const b = (t: string): Beat => ({ t });

const base: Omit<Idea, 'id' | 'title' | 'status'> = {
  week: null, postDate: null, summary: '', pillar: '', type: '', style: '', onCamera: '', voice: 'Mariena', feeling: '', harmHelp: '', cta: '',
  take: null, story: null, series: '', ep: null, safety: 'clear', origin: 'agent', brief: '', sourceLink: null, noStory: false, channels: ['TikTok'], links: [], innerWorld: [],
  hooks: [], chosen: null, rehook: null, beats: [], gut: {}, tips: null, notes: [], drafted: [], script: [], prep: [], slate: '',
  look: L('', '', '', '', ''),
};
const mk = (o: Partial<Idea> & Pick<Idea, 'id' | 'title' | 'status'>): Idea => ({ ...structuredClone(base), ...o });
const past = (id: string, title: string, pillar: string, type: string, week: string, postDate: string): Idea =>
  mk({ id, title, pillar, type, week, postDate, status: 'scheduled', past: true });

const WA = 'workplace-advice/stories/';

function ideas(): Idea[] {
  return [
    /* ---------- Week of Nov 23: the seven on deck ---------- */
    mk({
      id: 'tell-boss', title: 'Workplace advice: Automated my job, tell my boss?', status: 'on deck', week: CUR_WEEK, postDate: '2026-11-30',
      summary: 'Someone automated 60% of their role and is weighing whether to tell their manager. My advice: tell them, and bring the dollar value of the time you freed.',
      pillar: 'Messy', type: 'authority', style: 'workplace advice', onCamera: 'talking head', feeling: 'seen', harmHelp: 'help', cta: 'comment question', take: 3,
      series: 'Workplace advice', ep: 2, origin: 'read', brief: WA + '2026-11-15-automated-sixty-percent-tell-boss.md',
      sourceLink: { label: 'r/IndianWorkplace post', url: 'https://www.reddit.com/r/IndianWorkplace/comments/1smg04n/automated_my_work_saving_60_time_should_i_reveal/' },
      hooks: [
        H('Someone automated 60% of their job and wants to know if they should tell their boss.', 'Automated 60% of my job. Tell my boss?', 'Me holding the letter up to camera, eyebrows raised', 'question', 'Verdict at 0:08', true),
        H('If you automated most of your job, the worst move is staying quiet.', "Don't hide it.", 'Close-up, finger to lips, then a head shake', 'bold claim', 'Reason at 0:05'),
        H('Dear Mariena: I automated my job and my boss has no idea.', 'Dear Mariena...', 'Kraft envelope opening on the desk, overhead', 'story in motion', 'Letter ends 0:12'),
        H("Your boss doesn't need to know you automated your job. They need to know what it's worth.", 'What is your time worth?', 'Me sliding a price tag across the desk', 'reframe', 'Dollar value at 0:06'),
      ],
      beats: [b('Read the letter: 60% automated, boss has no idea, afraid of being "found out"'), G('My take: put a dollar value on the work you freed, the way customer service prices an inquiry', 'your take, in your words'), b('If it were me: tell them, with a plan for the hours you got back'), b('Ask: what would you do?')],
      gut: { Dawn: 'yes', Alex: 'yes', Paloma: 'not sure' },
      tips: { Dawn: 'Say out loud that telling the boss protects the writer, not just the company.', Alex: 'Give the one-line script: "Here is what that time is worth."', Paloma: 'Open on the letter so Paloma gets the plot first.' },
      look: L('Desk, camera left', 'Green cardigan', 'Office corner', 'Letter on kraft paper', 'Captions on. Letter text as an on-screen card. Cut the pause before the verdict.'),
      notes: [{ who: 'You in #tiktok, Nov 17', text: 'Love this one. Make sure the advice isn\'t "hide it."' }, { who: 'Orca in #tiktok, Nov 18', text: "Mark's storyboard is in the thread. Four hooks from Cody, recommended one first." }],
      drafted: ['pillar', 'type', 'feeling', 'take', 'cta'], slate: 'A1 TELL BOSS',
      prep: ['Print the letter on kraft paper', 'Pull up the Reddit post (for the exact wording)'],
      script: [
        S('Someone automated 60% of their job and wants to know if they should tell their boss.'),
        S('Here\'s what they wrote. "I automated my work and I\'m saving 60% of my time. Should I tell my manager?"', true),
        S('"If I tell him, he\'ll just pile more work on all of us. Best case, I get praised. No chance of a promotion."', true),
        S('Okay. I get it. Staying quiet feels safer. But here\'s the thing.', true),
        S('My take: put a dollar value on the time you freed up. Customer service already prices every single inquiry. Your hours have a price too.', true, 'your take, in your words'),
        S('If it were me, I would tell them. But I would walk in with two things: what that time is worth, and a plan for what I do with it next.', true),
        S('Because if you don\'t decide what those hours are for, someone else will.', true),
        S('So. What would you do? Tell me in the comments.'),
      ],
    }),
    mk({
      id: 'chatbot-boss', title: 'Workplace advice: Boss trusts the chatbot over us', status: 'on deck', week: CUR_WEEK, postDate: '2026-12-01',
      summary: "A letter from someone whose boss pastes the team's analysis into a chatbot and goes with the bot. My advice: bring one decision where the bot was confidently wrong, and offer a review step.",
      pillar: 'Messy', type: 'authority', style: 'workplace advice', onCamera: 'talking head', feeling: 'seen', harmHelp: 'harm', cta: 'none', take: 2,
      series: 'Workplace advice', ep: 3, origin: 'read', brief: WA + '2026-11-15-boss-trusts-chatbot-over-team.md',
      sourceLink: { label: 'r/antiwork post', url: 'https://www.reddit.com/r/antiwork/comments/1ucmycc/my_boss_has_ai_psychosis_and_were_fucked/' },
      hooks: [
        H('My boss trusts the chatbot over his own team. What do I do?', 'Boss trusts the bot > us', 'Me reading the letter, slow look up to camera', 'question', 'Advice at 0:07', true),
        H('Your boss picked the chatbot over you. Here is how you win that back.', 'Win it back', 'Me crossing my arms, then a grin', 'stakes', '0:05'),
        H('The chatbot was confidently wrong. Nobody checked.', 'Nobody checked', 'Red pen circling a printout', 'bold claim', '0:06'),
      ],
      chosen: 0,
      beats: [b('Read the letter'), b('My take: "Everyone says put a human in the loop. People need guidance, not just policies."'), b('If it were me: one decision where the bot was confidently wrong, and a review step'), b('Close: your expertise is the loop')],
      gut: { Dawn: 'yes', Alex: 'yes', Paloma: 'yes' },
      tips: { Dawn: 'Name the cost to the team when the bot wins by default.', Alex: 'The review step is the how. Say it slowly.', Paloma: 'Let the slow look up land before you speak.' },
      look: L('Desk, camera left', 'Green cardigan', 'Office corner', 'Letter on kraft paper', 'Captions on. Punch in on "confidently wrong."'),
      notes: [{ who: 'You in #tiktok, Nov 19 (voice take)', text: "The human in the loop isn't a checkbox. It's somebody who knows what good looks like." }],
      drafted: ['harmHelp'], slate: 'A2 BOSS BOT',
      prep: ['Print the letter on kraft paper'],
      script: [S('My boss trusts the chatbot over his own team. What do I do?'), S('[Read the letter]'), S("Everyone says put a human in the loop. People need guidance, not just policies."), S('If it were me: bring one decision where the bot was confidently wrong, and offer a review step.', true)],
    }),
    mk({
      id: 'dyslexia', title: 'Workplace advice: The dyslexia note in the signature', status: 'on deck', week: CUR_WEEK, postDate: '2026-12-02',
      summary: "A small-business owner's trainee is dyslexic and open about it; client emails still carry errors spellcheck misses. Should she add a note to her signature? My advice: skip the label, give her the tools to do the job on her own terms.",
      pillar: 'Messy', type: 'authority', style: 'workplace advice', onCamera: 'talking head', feeling: 'seen', harmHelp: 'help', cta: 'comment question', take: 10,
      series: 'Workplace advice', ep: 4, origin: 'read', brief: WA + '2026-11-15-dyslexic-trainee-email-signature.md',
      sourceLink: { label: 'Mumsnet, Am I Being Unreasonable', url: 'https://www.mumsnet.com/talk/am_i_being_unreasonable/5472715-to-ask-dyslexic-team-member-to-put-a-note-on-her-email-signature' },
      hooks: [
        H('My trainee is dyslexic. Should she put a note about it in her email signature?', 'A note in her signature?', 'Me holding up a printed email, typo circled', 'question', 'Advice at 0:08', true),
        H("The fix isn't a label. It's a tool.", 'Not a label. A tool.', 'Me crossing out a sticky note that says "sorry for typos"', 'reframe', '0:05'),
        H('Nobody should have to apologize for how their brain works in every email.', 'No apology needed', 'Close-up, slow head shake', 'bold claim', '0:06'),
      ],
      beats: [b('Read the letter: a great trainee, open about her dyslexia, errors still slip through'), b('Why a signature note is the wrong fix: it puts the label on her, not the problem'), G('My take: if you value what your people do, give them tools that work their way', 'your take, in your words'), b('If it were me: dictation and an AI checker that flags without rewriting, plus a proper workplace assessment'), b('Ask: would you add the note?')],
      gut: { Dawn: 'yes', Alex: 'yes', Paloma: 'not sure' },
      tips: { Dawn: 'Keep the joke off the trainee. She is the hero here.', Alex: 'Name the two tools on screen so they can try them Monday.', Paloma: 'Open on the circled typo so there is a problem to solve.' },
      look: L('Desk, camera left', 'Green cardigan', 'Office corner', 'Printed email with a circled typo', 'Captions on. No names on screen.'),
      notes: [{ who: 'Orca in #tiktok, Nov 18', text: 'Disability disclosure. The person at the center is the trainee, not the poster; keep the joke off her.' }],
      drafted: ['pillar', 'type', 'feeling', 'take', 'cta'], slate: 'A3 SIGNATURE',
      prep: ['Print an email with one circled typo'],
      script: [S('My trainee is dyslexic. Should she put a note about it in her email signature?', true), S('[Read the letter]'), S("If you value what your people do, the fix isn't a label. It's a tool.", true, 'your take, in your words')],
    }),
    mk({
      id: 'appraisals', title: 'Workplace advice: Twenty appraisals, one chatbot', status: 'on deck', week: CUR_WEEK, postDate: '2026-12-03',
      summary: 'A manager with 20 direct reports loses every appraisal season to write-ups and hopes a chatbot can write them. My advice: use it for wording, never for the substance, and fix the process.',
      pillar: 'Value', type: 'authority', style: 'workplace advice', onCamera: 'talking head', feeling: 'seen', harmHelp: 'neutral', cta: 'none', take: 16,
      series: 'Workplace advice', ep: 5, origin: 'read', brief: WA + '2026-11-15-twenty-appraisals-chatgpt.md',
      sourceLink: { label: 'Mumsnet, Work', url: 'https://www.mumsnet.com/talk/work/5107892-do-you-use-chatgpt-at-work-for-appraisals' },
      hooks: [
        H('Twenty appraisals, one weekend, and a brand-new ChatGPT account.', '20 appraisals. 1 chatbot.', 'A tall stack of paper, me peeking over it', 'story in motion', 'Advice at 0:09', true),
        H('Would you want your review written by a chatbot?', 'Would you?', 'Me raising one eyebrow, holding a review form', 'question', '0:05'),
        H('Use AI for the wording. Never for the judgment.', 'Wording, not judgment', 'Two kraft tags: WORDING, JUDGMENT', 'bold claim', '0:06'),
      ],
      beats: [b('Read the letter: 20 reports, weekends lost, just signed up for ChatGPT'), b('The split in the replies: "disrespectful" vs "use it for wording"'), G('My take: business impact and people go in balance', 'your take, in your words'), b('If it were me: your own points first, AI for wording, company tool only, and self-reflections before the write-up')],
      gut: { Dawn: 'not sure', Alex: 'yes', Paloma: 'yes' },
      tips: { Dawn: "Say how it feels to get a review that doesn't sound like your manager.", Alex: 'Give the order of steps: points, then wording, then edit.', Paloma: 'The paper stack is the plot. Let it wobble.' },
      look: L('Desk, camera left', 'Coral blouse', 'Office corner', 'Stack of paper, review form', 'Captions on.'),
      notes: [{ who: 'Orca in #tiktok, Nov 18', text: 'Harm, help or both: both. Drafted as neutral until you call it.' }],
      drafted: ['pillar', 'type', 'feeling', 'take', 'harmHelp', 'cta'], slate: 'B1 APPRAISALS',
      prep: ['Stack of paper for the opening shot'],
    }),
    mk({
      id: 'two-pm', title: 'Workplace advice: Done with work by 2pm', status: 'on deck', week: CUR_WEEK, postDate: '2026-12-04',
      summary: "Someone whose paid ChatGPT finishes their day's work by 2pm asks if they're wrong to be pleased. My advice: enjoy it, and decide with your manager what the saved time is for, before someone else does.",
      pillar: 'Messy', type: 'authority', style: 'workplace advice', onCamera: 'talking head', feeling: 'optimistic', harmHelp: 'help', cta: 'comment question', take: 16,
      series: 'Workplace advice', ep: 6, origin: 'read', brief: WA + '2026-11-15-done-by-two-pm.md',
      sourceLink: { label: 'Mumsnet, Am I Being Unreasonable', url: 'https://www.mumsnet.com/talk/am_i_being_unreasonable/5356130-to-find-that-chatgpt-is-saving-me-tons-of-time-at-work' },
      hooks: [
        H("My AI finishes my job by 2pm and I don't know what to do with the rest of the day.", 'Done by 2pm', 'Wall clock at 2:00, me with feet up', 'story in motion', 'Advice at 0:09', true),
        H('Finishing early is the dangerous part.', 'The dangerous part', 'Me tapping a watch', 'bold claim', '0:05'),
        H('What would you do with three free hours a day?', '3 free hours', 'Three kraft tags labeled 3, 4, 5', 'question', '0:07'),
      ],
      beats: [b('Read the letter: done by 2pm, afternoons in the sun'), b('Why finishing early is the risky part: someone else decides what the time is for'), G('My take: business impact and people go in balance', 'your take, in your words'), b('If it were me: book 20 minutes with your manager this week and bring a plan for the hours'), b('Ask: what would you do with three free hours?')],
      gut: { Dawn: 'yes', Alex: 'yes', Paloma: 'not sure' },
      tips: { Dawn: 'Let them enjoy it first. The warning comes second.', Alex: 'The 20-minute meeting is the how. Say what to bring.', Paloma: 'Start on the clock hitting 2:00.' },
      look: L('Desk, camera left', 'Green cardigan', 'Office corner', 'Wall clock, three kraft tags', 'Captions on. Clock tick sound on the open.'),
      drafted: ['pillar', 'type', 'feeling', 'take', 'cta', 'harmHelp'], slate: 'A4 TWO PM',
    }),
    mk({
      id: 'husband', title: "AI-ITA: My coworker husband says 'just ask AI'", status: 'on deck', week: CUR_WEEK, postDate: '2026-12-05',
      summary: 'Read a real post: her husband, also her coworker, answers every question with "just ask AI." My verdict, then ChatGPT\'s.',
      pillar: 'Messy', type: 'personality', style: 'AI-ITA', onCamera: 'talking head', feeling: 'cheeky', harmHelp: 'harm', cta: 'none', take: 13,
      series: 'AI-ITA', ep: 1, origin: 'read', brief: 'aita-ai/stories/2026-11-15-husband-says-ask-ai.md',
      sourceLink: { label: 'r/AmItheAsshole post', url: 'https://www.reddit.com/r/AmItheAsshole/comments/1vq76zl/' },
      hooks: [
        H("My husband is my coworker, and his answer to everything is 'just ask AI.'", 'AI-ITA: Am I the AI-hole?', 'Peg-person judge on the desk, gavel down', 'story in motion', 'Verdict at 0:15', true),
        H("Is he the AI-hole? Let's find out.", 'Is he the AI-hole?', 'Me squinting at my phone', 'question', '0:15'),
        H('"Just ask AI" is not an answer. Or is it?', 'Just ask AI?', 'Me holding up a tiny felt gavel', 'reframe', '0:10'),
      ],
      chosen: 0,
      beats: [b('Read the post, in a dramatic voice'), G('My verdict: not the AI-hole, but close', 'your verdict, in your words'), b("My take: AI doesn't need to be your everything"), b("ChatGPT's verdict, read flat")],
      gut: { Dawn: 'yes', Alex: 'not sure', Paloma: 'yes' },
      tips: { Dawn: 'Keep the verdict kind to both of them.', Alex: 'Add one line on when asking AI is the right call.', Paloma: 'The dramatic read is the plot. Go big.' },
      look: L('Couch, camera straight on', 'Coral blouse', 'Living room', 'Peg-person judge, tiny felt gavel', "Split screen for ChatGPT's verdict. Gavel sound on the cut."),
      drafted: ['take'], slate: 'B2 HUSBAND',
      prep: ['Pull up the Reddit post', 'Paste the post into ChatGPT and screenshot its verdict'],
      script: [S("My husband is my coworker, and his answer to everything is 'just ask AI.'"), S('The post, word for word, goes here once it\'s captured.', true, 'the post text: the Reddit page could not be read'), S("My verdict: not the AI-hole. But he's close.", true, 'your verdict, in your words'), S("AI doesn't need to be your everything. It shouldn't be.", true), S("Now here's what ChatGPT said.")],
    }),
    mk({
      id: 'chatbot-said', title: "Tales From Tech Support: 'But the chatbot said'", status: 'on deck', week: CUR_WEEK, postDate: '2026-12-06',
      summary: "A caller insists the chatbot promised a policy that doesn't exist. Told in felt. Then the turn: who is accountable when the bot makes it up?",
      pillar: 'Messy', type: 'storyline', style: 'Tales From Tech Support', onCamera: 'felt world', voice: 'narrator', feeling: 'seen', harmHelp: 'harm', cta: 'none', take: 2,
      series: 'Tales From Tech Support', ep: 1, origin: 'read', brief: 'tech-support-tales/stories/2026-11-15-the-chatbot-said.md',
      sourceLink: { label: 'r/talesfromtechsupport post', url: 'https://www.reddit.com/r/talesfromtechsupport/comments/1pp01pb/' },
      hooks: [
        H("The ticket said: 'But the chatbot said I could.'", 'Tales From Tech Support', 'A felt animal in a headset answers a paper phone', 'story in motion', 'The turn at 0:14', true),
        H('The chatbot made up a policy. Guess who had to honor it.', 'Guess who paid', 'Felt animal staring at a paper receipt', 'stakes', '0:07'),
        H('Who is accountable when the bot makes it up?', 'Who pays?', 'Felt animal and peg-doll caller staring at each other', 'question', '0:12'),
      ],
      chosen: 0,
      beats: [b('Caller: "But the chatbot said I could"'), b('Tech support checks: no such policy'), G('The turn: who is accountable when the bot makes it up', 'the turn, in your words'), b('Close: a human in the loop needs a playbook, not just a policy')],
      gut: { Dawn: 'yes', Alex: 'not sure', Paloma: 'yes' },
      tips: { Dawn: 'The caller is not the villain. Keep tech support kind.', Alex: 'Name the playbook in one line at the close.', Paloma: 'The felt phone ringing is your first frame.' },
      look: L('Tabletop, overhead', 'Plum sweater (hands only)', 'Craft table', 'Felt animal in a headset, peg-doll caller, paper laptop', 'Narrator VO recorded after. Stop-motion feel: 8 fps on the felt.'),
      drafted: ['voice'], slate: 'C1 TICKET',
      prep: ['Felt animal, headset and paper phone on the craft table', 'Overhead rig and second light'],
    }),

    /* ---------- New (proposed) ---------- */
    mk({
      id: 'skills-stuck', title: 'The agents barely got used. The skills stuck.', status: 'proposed',
      summary: 'A team I worked with built grant-writing agents. They barely use the agents, but the skills stuck and the work changed from reactive to a pipeline.',
      pillar: 'Value', type: 'storyline', style: 'documenting my work', onCamera: 'talking head', feeling: 'optimistic', harmHelp: 'help', cta: 'none', take: 10, story: 'grant',
      series: 'Unfolding now: the agent course', ep: 3, safety: 'blinded', origin: 'experience', brief: 'Story bank: grant agents for a philanthropy team',
      hooks: [
        H('We built a team AI agents. They barely use them. And it worked anyway.', "The agents flopped. The team didn't.", 'Me shrugging at a laptop, then a slow smile', 'reframe', 'Result at 0:09', true),
        H('More grants by October than all of last year, and the agents had almost nothing to do with it.', "It wasn't the agents", 'Paper stack of grant folders, one by one', 'stakes', '0:06'),
        H('Nobody uses the agents we built. Best project of my year.', 'Best project of my year', 'Me laughing, hand over face', 'bold claim', '0:05'),
      ],
      chosen: 0,
      beats: [b('The setup: a team I worked with, grant agents'), b('The twist: they barely use the agents'), W('What changed: AI in the daily workflow, reactive to a pipeline', "the VP's yes to quote her"), b("My take: if you don't value what your people do, your AI efforts fail")],
      gut: { Dawn: 'yes', Alex: 'yes', Paloma: 'yes' },
      tips: { Dawn: 'Credit the team, not the tools.', Alex: 'One sentence on what a pipeline looks like on a Monday.', Paloma: 'Hold the twist for a beat before you explain it.' },
      look: L('Desk, camera left', 'Coral blouse', 'Office corner', 'Stack of folders', 'No numbers on screen until the VP says yes.'),
      notes: [{ who: 'Orca in #tiktok, Nov 18', text: 'Blinded. Say "a team I worked with." Permission to quote the VP is still open.' }],
      drafted: ['feeling'], added: 5,
    }),
    mk({
      id: 'context', title: 'Copilot has your data. So why are its answers so generic?', status: 'proposed',
      summary: 'Walk through the scope brief I generated for the agent course: what I gave it (references, call transcripts, who it was for) and why the result was good.',
      pillar: 'Value', type: 'authority', style: 'show and tell', onCamera: 'show and tell', feeling: 'empowered', harmHelp: 'help', cta: 'Mellonmail', ctaLink: "Brief template in this week's Mellonmail",
      safety: 'blinded', origin: 'experience', brief: 'briefs/2026-11-09-what-i-set-up-before-asking-ai.md',
      hooks: [
        H('Copilot has all your data. So why are its answers so generic?', 'Same data. Better brief.', 'Split screen: generic answer next to the scope brief', 'question', 'The difference at 0:10', true),
        H('I gave AI five things before I asked for anything.', '5 things first', 'Five kraft tags fanned on the desk', 'reframe', '0:04'),
        H("The prompt wasn't the problem. The context was.", 'It was the context', 'Me tapping the printed brief', 'bold claim', '0:05'),
      ],
      beats: [b('Show the generic answer'), b("Show what I gave it: references, transcripts, who it's for"), b('Show the brief, with stakeholder quotes (anonymized on screen)'), G('Context makes the result', 'your take, in one line')],
      gut: { Dawn: 'not sure', Alex: 'yes', Paloma: 'not sure' },
      tips: { Dawn: 'Mention who the brief was for: real people on a real team.', Alex: 'This is pure how. Name all five inputs on screen.', Paloma: 'Start with the bad answer so there is a before and after.' },
      look: L('Desk, camera left', 'Coral blouse', 'Office corner', 'Laptop, printed scope brief (anonymized)', 'Screen recording inserts from context-demo. Blur any client name.'),
      notes: [{ who: 'You, Nov 4', text: 'Because it had the transcripts, it could pull exact quotes. Because I told it who the brief was for, it knew what to leave out. Record from the anonymized copy only.' }],
      drafted: [], added: 4,
    }),
    mk({
      id: 'do-it-scared', title: 'Grieve, then get started. Do it scared.', status: 'proposed',
      summary: "Being let go in 2023, the year of identity crisis, and what I'd tell that version of me. For anyone watching AI reshape their job.",
      pillar: 'Grounded', type: 'personality', style: 'hot take', onCamera: 'talking head', feeling: 'motivated', harmHelp: 'neutral', cta: 'follow', take: 1, story: 'letgo', origin: 'experience',
      brief: 'Story bank: being let go',
      hooks: [
        H("In 2023 I got let go. Here's what I'd tell that version of me.", 'Let go in 2023', 'Me on the porch steps, coffee in hand', 'story in motion', '0:06', true),
        H('Grieve, then get started.', 'Grieve. Then start.', 'Tight close-up, no smile', 'bold claim', '0:03'),
        H('Nobody tells you the scary part lasts a while.', 'The scary part lasts', 'Me walking toward camera on a trail', 'stakes', '0:08'),
      ],
      beats: [G('Cold open: 2023, the day I got let go', 'the scene: the day, the room'), b('The year after: twelve months of not knowing who I was without the job'), b('What I would tell that version of me: grieve, then get started'), b('Do it scared. Close walking forward on the trail')],
      gut: { Dawn: 'yes', Alex: 'not sure', Paloma: 'yes' },
      drafted: ['pillar', 'type', 'feeling', 'style', 'cta', 'take'], added: 3,
    }),
    mk({
      id: 'finance-app', title: 'I built the Mint replacement I never found', status: 'proposed',
      summary: "Demo my family's finance app: an evergreen app built to exactly what I wanted. Hook off the ghost-subscriptions wave; my angle is building for yourself, not for a demo.",
      pillar: 'Building', type: 'personality', style: 'show and tell', onCamera: 'show and tell', feeling: 'empowered', harmHelp: 'help', cta: 'GitHub link', take: 13, origin: 'experience',
      brief: 'briefs/2026-11-07-family-finance-app.md',
      hooks: [
        H('I looked for a Mint replacement for a year. Then I built one.', 'So I built it', 'Me holding my phone up with the app open', 'story in motion', 'Demo at 0:06', true),
        H('Everyone is canceling ghost subscriptions with AI. I built the whole app.', 'I built the whole app', 'Screen: a list of subscriptions, one by one crossed out', 'reframe', '0:08'),
        H('The best app I use, nobody else will ever download.', 'Built for one family', 'Me at the kitchen table, laptop open', 'bold claim', '0:05'),
      ],
      beats: [b('A year of looking for a Mint replacement'), b('The app on my phone: the three screens we actually use'), b('Why build for one family, not for a demo'), b('Where the code lives, on GitHub')],
      gut: { Dawn: 'not sure', Alex: 'yes', Paloma: 'yes' },
      drafted: ['feeling', 'cta'], added: 2,
    }),
    mk({
      id: 'data-stories', title: 'Why "Turning Data Into Stories" is my most popular course', status: 'proposed',
      summary: 'A hypothesis: people want skills that let them answer their own questions with data they already have, when the answer was never easy to find.',
      pillar: 'Value', type: 'authority', style: 'hot take', onCamera: 'talking head', feeling: 'curious', harmHelp: 'neutral', cta: 'Mellonmail', origin: 'agent',
      brief: 'Your #tiktok post, Nov 16',
      hooks: [
        H('My most popular course has nothing to do with AI.', 'Not an AI course', 'Me holding a hand-drawn bar chart', 'bold claim', '0:04', true),
        H('Why do people keep signing up for this one course?', 'Why this course?', 'Course sign-up page on screen', 'question', '0:06'),
        H('Everyone wants to answer their own questions.', 'Answer your own questions', 'Sticky notes with questions on a wall', 'reframe', '0:07'),
      ],
      beats: [b('Open: my most popular course has nothing to do with AI'), G('Why I think people sign up', 'why you think it is popular, in your words'), G('One learner who answered their own question with data they already had', 'one learner story'), b('Close: the skill under all the AI skills')],
      drafted: ['pillar', 'type', 'feeling', 'style', 'onCamera', 'harmHelp', 'cta', 'summary'], added: 1,
    }),

    /* ---------- Backlog ---------- */
    mk({
      id: 'data-dos', title: "Do and don't when using AI to analyze data", status: 'backlog',
      summary: "A quick listicle: three do and three don't for using AI on your own data.",
      pillar: 'Value', type: 'authority', style: 'listicle', onCamera: 'talking head', feeling: 'curious', harmHelp: 'help', cta: 'resource landing page', origin: 'agent',
      brief: 'Your #tiktok post, Nov 16',
      beats: [b('Open: the one mistake everyone makes first'), G("Three do's", "your real do's"), G("Three don'ts", "your real don'ts"), b('Close: where to start Monday')],
      drafted: ['pillar', 'type', 'feeling', 'style', 'cta'],
    }),
    mk({
      id: 'lightning-data', title: 'A lightning overview of how I teach people to turn data into stories', status: 'backlog',
      summary: 'Maybe a listicle: the steps of the course in under a minute.',
      pillar: 'Value', type: 'authority', style: 'listicle', onCamera: 'talking head', feeling: 'curious', harmHelp: 'help', cta: 'Mellonmail', origin: 'agent',
      brief: 'Your #tiktok post, Nov 16',
      beats: [G('The steps, one line each', 'the steps as you teach them')],
      drafted: ['pillar', 'type', 'feeling', 'style', 'cta', 'harmHelp'],
    }),
    mk({
      id: 'let-go-podcast', title: 'Being let go in 2023: reuse the podcast clip, with B-roll', status: 'backlog',
      summary: 'Reuse the podcast where I talked about it openly, cut with B-roll.',
      pillar: 'Grounded', type: 'storyline', style: 'long-form cut', onCamera: 'narrator', feeling: 'seen', harmHelp: 'neutral', cta: 'follow', story: 'letgo', origin: 'experience',
      brief: 'Podcast not on file yet; confirm which appearance',
      drafted: ['pillar', 'type', 'feeling', 'style', 'onCamera', 'cta'],
    }),

    /* ---------- Rejected ---------- */
    mk({
      id: 'tahoe', title: 'Chatbot Court: A Tahoe for one dollar', status: 'rejected',
      summary: 'Skit judging the dealership chatbot that agreed to sell an SUV for a dollar, then what I would have done differently.',
      pillar: 'Messy', type: 'authority', style: 'skit', onCamera: 'skit', feeling: 'cheeky', harmHelp: 'harm', cta: 'none', origin: 'read',
      sourceLink: { label: 'Gizmodo', url: 'https://gizmodo.com/ai-chevy-dealership-chatgpt-bot-customer-service-fail-1851111825' },
      drafted: ['feeling', 'type'],
    }),
    mk({ id: 'no-ai-boss', title: 'AI-ITA: The No-AI Boss Got Caught', status: 'rejected', pillar: 'Messy', style: 'AI-ITA', feeling: 'cheeky', origin: 'read', drafted: ['feeling'] }),
    mk({ id: 'dead-by-then', title: 'Tales From Tech Support: "I\'ll Be Dead By Then"', status: 'rejected', pillar: 'Perspective', style: 'Tales From Tech Support', feeling: 'seen', origin: 'read', drafted: ['feeling'] }),

    /* ---------- Past weeks: example rows until the real history is imported ---------- */
    past('p1', 'My uncle the logger, and the mills that closed', 'Perspective', 'storyline', '2026-11-09', '2026-11-16'),
    past('p2', 'What I set up before asking AI anything', 'Value', 'authority', '2026-11-09', '2026-11-17'),
    past('p3', 'Old Tech Panics: the calculator will ruin math', 'Perspective', 'authority', '2026-11-09', '2026-11-18'),
    past('p4', "Building my family's finance app, day 1", 'Building', 'personality', '2026-11-09', '2026-11-19'),
    past('p5', 'The survey said nobody has time to experiment', 'Messy', 'authority', '2026-11-09', '2026-11-20'),
    past('p6', 'We are more than what we do', 'Grounded', 'personality', '2026-11-09', '2026-11-21'),
    past('p7', 'Demo day: the moment a skeptic asked for the link', 'Value', 'storyline', '2026-11-09', '2026-11-22'),
    past('q1', 'Do it with me: where it started', 'Value', 'storyline', '2026-11-16', '2026-11-23'),
    past('q2', 'Six months to real results with AI champions', 'Value', 'authority', '2026-11-16', '2026-11-24'),
    past('q3', "Copilot rollout, week one: what logins don't tell you", 'Building', 'authority', '2026-11-16', '2026-11-25'),
    past('q5', 'Who gets left behind when the course is optional', 'Perspective', 'personality', '2026-11-16', '2026-11-27'),
    past('q6', "AI doesn't need to be your everything", 'Grounded', 'personality', '2026-11-16', '2026-11-28'),
  ];
}

const T = (short: string, text: string, pillar: string, onCamera = 'ready') => ({ short, text, pillar, onCamera });

export function seed(): Data {
  return {
    schema: 2,
    ideas: ideas(),
    takes: {
      1: T('do it scared', "Yes, it's scary and uncomfortable. Grieve, then get started. Do it scared.", 'Grounded, Messy'),
      2: T('guidance, not just policies', 'Everyone says "put a human in the loop." People need guidance, not just policies.', 'Messy'),
      3: T('dollar values for tasks', 'Organizations need to assign dollar values to tasks and workflows, not one giant bucket of headcount costs. Customer service already does it: an inquiry has a dollar value.', 'Perspective, Value'),
      4: T('not everything is a course', "L&D's control over learning, and solving everything with a course.", 'Value'),
      5: T('pick a team metric first', "Teaching basic AI skills didn't move ROI. Pick a metric from the team's goals first. If the org doesn't track metrics at the team level, you're pushing upstream.", 'Value', 'ready, client blinded'),
      6: T('slow change, act with urgency', 'Change will be slow for most established companies. You have time, but act with urgency.', 'Perspective'),
      7: T('"cool" over readiness', 'Harmful advice: everyone building agents, the obsession with proactive and personal agents, "cool" over readiness.', 'Perspective, Messy'),
      8: T('agent safety frameworks', 'People need agent safety frameworks and risk assessment for specific uses.', 'Value'),
      9: T('an experimentation mindset', 'An experimentation mindset.', 'Messy'),
      10: T('value what your people do', "If you don't value what your people do, your AI efforts will fail.", 'Value, Messy'),
      11: T('more than what we do', 'We are more than what we do.', 'Grounded'),
      12: T('map workflows, take a seat', 'The people who map workflows and think holistically about people, risk and reliability will have the greatest influence over future org design. If you want a seat at the table, take an active role.', 'Perspective'),
      13: T("AI isn't your everything", "AI doesn't need to be your everything. It shouldn't.", 'Building, Grounded'),
      14: T('software as an artisan trade', 'Software engineering becoming an "artisan trade": there\'s so much more to software engineering than writing code.', 'Perspective'),
      15: T('no right to a certain job', 'People who think they have a right or moral obligation to a certain type of job, as if supply and demand and macro factors don\'t exist.', 'Perspective', 'care: pair with take 1'),
      16: T('business and people in balance', "Business impact and people go in balance. Not AI adoption for adoption's sake.", 'Value'),
      17: T('2027: IT approves connectors', 'Prediction: in 2027, enterprise IT will start approving connectors as its risk governance matures.', 'Perspective'),
      18: T('managers of AI systems', '"Managers of AI systems" will emerge: a functional expert with AI skills who sets up the playbooks and checks reliability for team workflows, the manager\'s right hand.', 'Perspective'),
    },
    stories: {
      letgo: { title: 'Being let go, 12 months of identity crisis, finding the thread', pillar: 'Grounded', known: '2023 restructuring; public; talked about on a podcast', missing: 'The scene: the day, the room', onCamera: 'ready' },
      uncle: { title: 'My uncle the logger', pillar: 'Perspective', known: 'Out of work when the mills closed; in the democratizing-technology Mellonmail issue', missing: 'Nothing', onCamera: 'ready' },
      doitwithme: { title: 'Where "do it with me" was born', pillar: 'Value', known: 'Saw what he could bring and how much stronger the outcome was when he helped build it', missing: 'What he brought; the day', onCamera: 'blinded' },
      membercomms: { title: 'Member comms: not pushing back', pillar: 'Value, Messy', known: "Months of investment, no meaningful ROI change; I knew and didn't recommend changing teams; what I do now in discovery", missing: 'Nothing', onCamera: 'blinded, client deciding' },
      philanthropy: { title: 'The philanthropy manager: blocker to supporter', pillar: 'Messy', known: "She came to see how she fit into an AI-ified version of her team's workflows", missing: 'What changed her mind', onCamera: 'blinded' },
      survey: { title: 'The survey: no time to experiment', pillar: 'Messy', known: "Survey data showed people don't have the time to experiment", missing: 'The number', onCamera: 'blinded' },
      champions: { title: 'AI champions: six months to real results', pillar: 'Value', known: '6 months to get the program delivering; 70% of team assets', missing: 'What "70% of team assets" means in plain words', onCamera: 'blinded' },
      grant: { title: 'Grant agents for a philanthropy team', pillar: 'Value', known: '39 grant submissions by late October vs 37 in all of 2025; AI in the daily workflow; reactive grantwriting to a systematic pipeline. The agents aren\'t used much; the skills stuck', missing: 'Permission to quote the VP', onCamera: 'blinded until she says yes' },
      chiefs: { title: 'Chiefs workshop', pillar: 'Value', known: 'Research to synthesis to deck', missing: 'The result or number', onCamera: 'blinded' },
      quote: { title: "A manager's quote", pillar: 'Value', known: 'A quote exists', missing: 'The quote, and clearance', onCamera: 'blinded' },
      sales: { title: 'Sales: focus and time', pillar: 'Value', known: 'Sales team got focus and time back', missing: 'The number', onCamera: 'blinded' },
      completion: { title: '2x course completion', pillar: 'Value', known: 'Twice the completion rate', missing: 'Compared with what', onCamera: 'blinded' },
      demodays: { title: 'Demo days', pillar: 'Value', known: 'Run more than once; a toolkit exists', missing: 'One demo-day moment', onCamera: 'blinded' },
      teamhowto: { title: 'Team How-To (failure)', pillar: 'Messy', known: 'Named only', missing: 'What went wrong, what it taught me', onCamera: '?' },
      salesbrief: { title: 'POC and requirements for a sales brief (failure)', pillar: 'Messy', known: 'Named only', missing: 'What went wrong, what it taught me', onCamera: '?' },
      pastlife: { title: 'Past life: engineering and public policy, 17 years in tech, 15 managing people', pillar: 'Building, Perspective', known: '"Dig into this for a story"', missing: 'Which role change', onCamera: 'ready' },
      unfolding: { title: 'Unfolding now: the agent course, building agents safely, internal tools, workshops, demo days', pillar: 'Building', known: 'All in progress', missing: 'Series candidates: tell them as they happen', onCamera: 'blinded where client' },
    },
    opts: {
      type: ['authority', 'storyline', 'personality', 'follow the signal'],
      feeling: ['empowered', 'seen', 'inspired', 'motivated', 'cheeky', 'curious', 'optimistic'],
      style: ['listicle', 'AI-ITA', 'workplace advice', 'Old Tech Panics', 'Tales From Tech Support', 'documenting my work', 'show and tell', 'hot take', 'skit', 'felt-world story', 'long-form cut'],
      onCamera: ['talking head', 'skit', 'show and tell', 'felt world', 'outdoors', 'narrator'],
      voice: ['Mariena', 'narrator', 'AI voice (felt character)'],
      harmHelp: ['harm', 'help', 'neutral'],
      cta: ['none', 'follow', 'Mellonmail', 'resource landing page', 'GitHub link', 'comment question'],
      hookFormat: ['question', 'bold claim', 'story in motion', 'reframe', 'visual reveal', 'stakes'],
      series: ['Workplace advice', 'AI-ITA', 'Tales From Tech Support', 'Old Tech Panics', 'Unfolding now: the agent course'],
      safety: ['blinded', 'clear'],
      channel: [...DEFAULT_CHANNELS],
    },
    retired: {
      type: [], feeling: ['understood', 'called out', 'laughed', 'validated', 'hopeful', 'proud'],
      style: ['my own ideas'], onCamera: [], voice: [], harmHelp: [], cta: [], hookFormat: [], series: ['Chatbot Court'], safety: [], channel: [],
    },
    pillars: [
      { name: 'Value', color: 'var(--forest)', desc: 'Programs that build AI capability and drive business results. My programs in the wild live here, often as a series.', carries: 'Programs where teams shape it themselves' },
      { name: 'Building', color: 'var(--bluegreen)', desc: "Building in the open: what I'm building right now, how, and what I'm struggling with.", carries: "I'm shaping mine, out loud" },
      { name: 'Messy', color: 'var(--moss)', desc: "AI at work is messy: second-order effects, the little wins that show you're headed the right way, how to handle hard issues as they come.", carries: "What happens when it's done to people, and the small wins when it isn't" },
      { name: 'Perspective', color: 'var(--plum)', desc: 'The bigger picture: technical innovation, upskilling and public policy, who gets left behind.', carries: 'Policy and upskilling decide who gets to shape it' },
      { name: 'Grounded', color: 'var(--lavender)', desc: 'Staying grounded: I am more than my work; how I stay grounded and energized doing this work. Identity deconstruction lives here.', carries: "You're more than the work AI is changing" },
    ],
    config: {
      mission: 'Upskilling and changing how we work, at scale, for people in the workforce and contributing to the economy.',
      throughline: 'The people doing the work should shape how AI changes it, so more people come out the other side better off.',
      person: 'Alex, an under-resourced manager who tinkers. Gen Z or millennial, motivated, wants to do right by their team, believes AI can make the team better. More about results than decorum, always down for a good story and an impromptu game.',
      vibe: '"We\'re all figuring this out." A little whimsical, messy, thinking out loud. Silly and weird, smart, professional and quirky.',
      advice: '"If it were me, here\'s what I would do." No soapboxing, no know-it-all guru.',
      cadenceWeeks: 6, lastCheckin: '2026-11-18',
    },
    versions: [
      { n: 4, date: '2026-11-19', label: 'Tales From Tech Support added; "my own ideas" retired; Chatbot Court series retired', changes: [{ field: 'Content styles', from: '(ten styles)', to: 'Added "Tales From Tech Support". Retired "my own ideas" (a source, not a style).' }] },
      { n: 3, date: '2026-11-18', label: 'Feelings set to seven; type replaces buckets; mix ranges set', changes: [{ field: 'Feelings', from: 'understood, called out, laughed, validated, hopeful, proud, curious', to: 'empowered, seen, inspired, motivated, cheeky, curious, optimistic' }, { field: 'Mix ranges', from: '(none)', to: 'Starting targets from the brief, §6.3' }] },
      { n: 2, date: '2026-11-18', label: "The person: Alex's inner world added", changes: [{ field: 'The person', from: 'Alex, an under-resourced manager who tinkers.', to: "Added the core problem, what's hurting, what they've tried, what they're afraid of and what they want." }] },
      { n: 1, date: '2026-11-16', label: 'Imported from foundation.md (workbook answers)', changes: [] },
    ],
    targets: {
      'type.authority': [3, 3], 'type.storyline': [2, 2], 'type.personality': [1, 1], 'type.follow the signal': [1, 1],
      'pillar.Value': [4, 6], 'pillar.Messy': [3, 5], 'pillar.Building': [2, 4], 'pillar.Perspective': [1, 3], 'pillar.Grounded': [1, 2],
      'style.each': [0, 2], 'style.others': [0, 2], 'style.series': [1, 7],
      'camera.talking': [4, 5], 'hh.gap': [0, 1], 'cta.with': [0, 2], 'feeling.each': [0, 3],
    },
    includeProposed: false,
    locked: {},
    filmed: {},
    prepDone: {},
    ros: null,
  };
}
