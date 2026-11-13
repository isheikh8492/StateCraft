# 0013. The clock runs by the hour, to the next thing that needs you

Date: 2026-11-12. Status: accepted. Changes "The time control" in the overview spec.

## Context

From the owner, playing it. Pressing "Send" on the desk did not send: it opened the time
panel at the far side of the screen and asked how long to simulate. Asked what should happen
instead, the owner said two things. Nobody in politics decides to "let a week pass": you
act, and then something happens that needs you. And things do not happen days apart; they
happen within hours.

The game moved in days. A day's events were all dated to the day and shown together. The
world produced about one event a week. "To next major event" was one option in a menu of
durations.

## Decision

- **Play is one button on the desk.** It sends whatever is on the desk and runs the clock to
  the next thing that needs the player. It asks nothing.
- **It moves in hours, and never past the next morning.** If something is due later today
  (an answer to an order, somebody moving on their own, an event that is news) the clock
  stops at that hour. If orders are going out, it stops an hour on at the latest, when the
  first answer can land. With nothing left today it carries into tomorrow and stops at that
  day's first such thing, or at nine.
- **The desk says why it stopped:** who answered, who made a move, what happened, or that it
  is a new morning.
- **Everything has a time of day.** The engine still works a day out as the day begins, but
  nothing in it is known to anyone until the clock reaches its hour: not to the player, not
  to the cast when asked, not to whoever writes the news. What is done as a turn begins
  happens at that hour; figures, votes and changes on the ground are the morning's news at
  seven; the rest falls between eight in the morning and nine at night where the dice put it.
- **The pace follows the tension.** A calm day has one chance of something happening (0.7).
  A country with fighting or rioting has a second (0.8). The days after the government acts
  have a third (0.8). What came up in the last four days does not come up again, and
  something grave is not followed within three days by another.
- **The cast answers and moves within hours.** Answers to an order arrive one, three and six
  hours after it, as before. Somebody moving first on a day the clock has just reached does
  so later that day, at an hour the dice pick.
- **What stops the clock** is anything that is news: every event except routine notices and
  colour. Those are read in passing when their hour comes.
- **A quiet turn commits at once and is worded afterwards.** Its news is recorded in the
  plain lines the engine drew, and a model words them off to one side
  (`news.worded` in the ledger). The next move never waits for that.
- **The date control is the override.** It offers how far to run instead (a day, a week, a
  month, a date), for when time should simply pass. "To next major event" and "one hour
  later" leave it: the play button is both.

## Consequences

- Measured on `openai/gpt-oss-20b` (`docs/research/sessions/2026-11-12-by-the-hour.md`): a
  press with nothing ordered returns in about 0.1 s; a press that sends orders waits for
  the two calls before the commit, 22 to 23 s; three days of play held about fifteen stops.
- The numbers still jump at dawn. The engine applies a day's effects when the day begins
  and only the news of them is spread over the hours, so a figure can move in the morning
  for a reason the player reads at four in the afternoon.
- A term played this way is thousands of presses. That is the intent: the days that matter
  are played by the hour and the stretches between are skipped with the date control.
- Slow things stay slow: a budget measure still takes two weeks to pass, and effects still
  have lags of weeks.
- With a model that answers one request at a time, the wording of a new day's news and the
  cast's moves queue behind each other after a press, so the first lines of a day can be
  read in their plain form.
- The deck of the world's own events is now drawn from several times a day, and thirty
  entries is thin for that. Growing it is the next content work.
- "By turn" in the chronicle leaves out moves with no orders and nothing to show, since most
  presses now only pass time.
