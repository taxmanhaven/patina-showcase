# Sentence codebook v0.3 (6 Nov 2026)

How every sentence of fiction is labelled for the sentence matrix. Each sentence is labelled on every axis, using its paragraph as context. The examples are ours, written for this file. Pick the single best value; when torn, pick the one a careful reader would notice first.

v0.2 adds decision tests to the axes where two coders disagreed on a Cather pilot (kappa under 0.6: shape, mode, scene, who, what, how). Apply the test literally. v0.3 adds a clause test for form and a stricter "when", and works scene out by rule.

## B. Form (traditional grammar)
**Decision test:** first count the independent clauses (a subject and a finite verb that could stand alone). Then look for any dependent clause: a clause starting with that, which, who, whom, whose, when, while, as, as if, as though, because, if, after, before, until, since, where, although, though or so that, or a reported clause after said, knew, thought or saw. No finite main verb: fragment. One independent clause and no dependent clause: simple. Two or more independent clauses and no dependent clause: compound. One independent clause plus a dependent clause: complex. Two or more independent clauses plus a dependent clause: compound-complex. A question or command with a finite verb ("Are you sure?") is not a fragment.
- **fragment**: no finite main verb. "Tick." "Six pears, each in its own foam net."
- **simple**: one independent clause. "Dad took the box with both hands."
- **compound**: two or more independent clauses joined by and, but, so, or a semicolon. "He laughed, and he couldn't stop."
- **complex**: one independent clause plus at least one dependent clause. "When we pulled up, the Corsa was still there."
- **compound-complex**: two or more independent clauses plus at least one dependent clause.

## C. Shape (Christensen; classical rhetoric)
**Decision test, in this order:** 1. Ends with a question mark: question. 2. An order or an exclamation: command. 3. Three or more items in a row are the point: list. 4. Two clauses of similar length and grammar, set against each other (often with a semicolon or "but"): balanced. 5. The main subject and verb arrive after more than half the words, and the delay builds to them: periodic. A short fronted "When...", "After..." or "While..." clause does not make a sentence periodic. 6. The main clause is complete, then one or more modifiers (not new clauses with their own subject) follow after commas and add detail: cumulative. 7. Otherwise: plain.
- **plain**: the main clause carries it, with little added.
- **cumulative**: the main clause comes first, then free modifiers pile up after it. "He hung my coat, collar to the wall, smoothing the shoulders like a tailor."
- **periodic**: the main point is held back until the end. "Of all the people at that table, the one who ate the pepper sauce was Hana."
- **balanced**: two matching halves, or parallel clauses. "She kept the receipt; he kept the grudge."
- **list**: a run of three or more items is the point of the sentence.
- **question**: asks something, in narration or speech.
- **command**: an order or an exclamation.

## E. Mode (what the sentence is doing; Carlota Smith, adapted for fiction)
**Decision test for time:** does the sentence show one moment, lasting seconds to a minute, as it happens? Then event (or speech, thought or sensory). Does it cover a longer stretch (an afternoon, "we talked about...", "for years") or something habitual or repeated ("he often...", "said little")? Then summary. A sentence about how a person or place is, with no change happening, is description. That includes their traits and appearance. Commentary is only for the narrator's general judgement or a truth beyond this scene, never for a fact about a character.
- **event**: something happens now, in scene time. "He passed the jar across."
- **description**: how something is, with time standing still. "The hall smelled of onions and Pledge."
- **speech**: words spoken aloud (the quoted line, with its tag).
- **thought**: the narrator's or a character's inner reaction or feeling in the moment. "I wanted him before pudding."
- **summary**: compressed time, habit or backstory. "Twenty-two years he drove the 250."
- **exposition**: a fact about the world, a rule or a system, given to the reader.
- **commentary**: the narrator generalises, judges or sums up; an aphorism. "Fathers never say it straight."
- **sensory**: a single sense impression as a beat. "Somewhere upstairs a tap ran."

## F. Speech and thought presentation (Leech and Short, *Style in Fiction*)
- **narration**: the narrator reports events or states with no speech or thought in view.
- **speech-act**: narrator's report of a speech act. "He asked about her job."
- **indirect-speech**: "He said that the pears were too expensive."
- **free-indirect-speech**: a character's words in the narrator's grammar, with no tag. "Twelve pounds. For pears."
- **direct-speech**: quoted words.
- **thought-act**: narrator's report of a thought act. "I thought about the ring."
- **indirect-thought**: "I wondered whether he'd heard."
- **free-indirect-thought**: a character's thought in the narrator's grammar. "Friday. It had to be Friday."
- **direct-thought**: quoted thought, or thought in the present tense inside past narration. "I thought, that's nice, actually."

## Scene (the mode of the whole paragraph)
Not labelled by the coder. The tool works it out from the paragraph's sentence modes: the most common of speech (dialogue), event (action), description or sensory (description), thought or commentary (reflection), summary or exposition (summary).

## G. Paragraph role
- **opener**: sets the topic or the scene for the paragraph.
- **build**: adds to it.
- **turn**: reverses or surprises: a "but", a reveal, a change of direction.
- **button**: closes the paragraph on a punch, a joke, a meaning or a summing up.
- **beat**: a pause or a small act that sets the pace, often short.
- **bridge**: moves the reader to the next time, place or topic.

## H. The five Ws plus how (1 if the sentence itself carries it, else 0)
- **who**: 1 only if a person is named or identified by a noun ("Dad", "Hana", "grandmother", "the man in the shop"). Pronouns alone (I, he, she, they) are 0.
- **what**: 1 only if there is a physical action you could film ("took the box", "explored the cellar") or a touchable object named ("the bench", "the stove"). States, feelings, traits, speech and abstract things are 0.
- **when**: 1 only if the sentence names a time: a clock or calendar time, a part of the day, a date, a duration or a frequency ("on Sunday", "afternoon", "since 2019", "for years", "once", "often", "before pudding"). A word that only links two events (when, while, as, after, then) is 0.
- **where**: a place ("in the hall", "two doors away").
- **why**: a cause, reason or motive ("because the chair has the remote").
- **how**: 1 only if a word or phrase says how an action was done ("with both hands", "slowly", "anxiously"). Adjectives describing a person or thing are 0.
- **senses**: list each sense used: sight, sound, touch, smell, taste, body.

## I. Devices (list every one present)
simile, metaphor, aside, list, triple, sound-word, repetition, rhetorical-question, joke, irony, callback, fragment-for-effect, hyperbole, understatement.
