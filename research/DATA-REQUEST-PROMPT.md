# Data request prompt (for ChatGPT or another research assistant)

Roughly three-quarters of the scoring model's designed weight is currently
unpopulated. This file holds a ready-to-paste prompt for collecting the missing
fields, plus the request lists to paste with it.

## Which file does ChatGPT need?

**None.** Do not upload a file. The prompt below is self-contained: the player
ids, names, seasons and clubs are already in it, so an upload only invites the
assistant to echo values back instead of researching them.

What ChatGPT **produces** is a new file, dropped into `research/`:

| Request | Group | Save the reply as |
|---------|-------|-------------------|
| 1 | Goalkeeper (8) | `research/player-metrics-batch-5.json` |
| 2 | Defender (26) | `research/player-metrics-batch-6.json` |
| 3 | Midfielder (18) | `research/player-metrics-batch-7.json` |
| 4 | Creator, AM/W (22) | `research/player-metrics-batch-8.json` |
| 5 | Forward, ST (15) | `research/player-metrics-batch-9.json` |

`scripts/build-real-players.mjs` discovers `player-metrics-batch-*.json` by
pattern, so a new file is picked up with no code change. Run `node
scripts/build-real-players.mjs` after adding one.

Run **one request at a time**. A single request covering all 89 players produces
either truncated output or invented numbers, which is worse than no data at all
— see the null-honesty rules in the prompt.

Requests are ordered by how much scoring weight each one unlocks per player
researched, not by squad importance: goalkeeper 86% unpopulated, midfielder 81%,
defender 76%, creator 72%, forward 61%.

## Ask for these five dates of birth first

`scripts/build-real-players.mjs` drops any player with no usable date of birth,
so five of the 89 players below never reach the model at all. Researching their
metrics is wasted work until a birth date is found — and one of them sits in
each request, so it is worth clearing in one go before starting:

```
aaron-maguire       Aaron Maguire        GK  Tottenham Hotspur U21 / Hashtag United
sean-keogh          Sean Keogh           LB  Brighton & Hove Albion U21
darius-lipsiuc      Darius Lipsiuc       CM  Solihull Moors (loan from Luton Town)
naj-razi            Naj Razi             AM  Como youth
kian-mcmahon-brown  Kian McMahon-Brown   ST  Burnley U18/U21
```

Same null rule applies: an unfound birth date is `null`, never an estimate from
an age or a youth-team year group.

## No mapping work needed — use the model's own key names

An earlier draft of this file asked for the key names used inside
`research/irish-players-research-round-2.json` (`groundDuelWinPercentage`,
`interceptionsPer90`, …) and flagged a dozen of them as needing a mapping line
added to the build script. That was the wrong target.

The two inputs use different conventions, and only one of them needs mapping:

- **Round-2 research file** — provider-style names, translated one by one in
  `deriveLatestMetrics()`. Any name without a line there is silently ignored.
- **Metrics batch files** — the *model's own* metric keys, spread straight into
  `positionSpecificMetrics` with no translation at all.

So by targeting a batch file, every field below lands with no code change. The
key names in the request lists are therefore the model keys from
`src/model/metrics.ts`, and they must be reproduced exactly; an unrecognised key
is carried into the season record but never scored, so a typo fails silently.

### Round-2 values win a conflict

The build script merges the two sources as:

```js
{ ...(batch?.metrics ?? {}), ...(deriveLatestMetrics(p) ?? {}) }
```

Nulls are stripped before this, so a batch value fills any gap round 2 left —
but where round 2 has a real number for the same key, **the batch value is
discarded**. Each request list below marks the keys round 2 can already supply
with `[R2]`.

Those are still worth researching: across the squad, round 2 fills only 60 of
the 235 `[R2]` slots it could — 26%. But the unmarked keys are the ones where a
value is guaranteed to take effect, so if a request has to be cut short, cut the
marked keys first.

### Do not supply `goalInvolvement90`

The build script computes it from that season's own appearances, minutes, goals
and assists, and does so *after* merging your metrics, so any value supplied
would be overwritten. Goals and assists are already covered by `seasonStats`.

### One season only, and it must be the season given

Unlike the research-file path, batch metrics have **no season guard**: they are
attached to the player's `lastCompletedSeason` slot whichever season the file
claims to describe. Researching 2024-25 for a player whose latest season is
2025-26 does not produce a historical record — it silently mislabels 2024-25
figures as current form. The season in each player list is the correct one.

---

# THE PROMPT

Copy everything below the line, replacing `{{FIELD_LIST}}` and
`{{PLAYER_LIST}}` from the request sections that follow.

---

You are compiling football statistics for a squad-analysis model. I need
per-90 and percentage metrics for a specific list of players, for one specific
season each.

## The single most important rule

**Never supply a number you have not found in a source. Use `null` instead.**

This model treats a missing metric and a zero as completely different things. A
missing metric is dropped and the remaining weights are renormalised. A zero is
scored as genuinely worst-in-class. So:

- If you cannot find a value, the field must be `null`. Not `0`, not an
  estimate, not a league-average, not a figure inferred from a similar player.
- If a source gives a season total but I asked for a per-90 rate, and you do not
  have reliable minutes to divide by, return `null` rather than dividing by an
  assumed number of minutes.
- If you are unsure whether a figure covers all competitions or just one, still
  supply it, but say which in `notes`.
- Do not interpolate from a prior season.

I would rather receive a mostly-null response with five trustworthy numbers than
a fully-populated one where half are guesses. Guesses are actively harmful here:
they enter percentile rankings against real values and silently distort every
other player's score.

## The second most important rule

**Never add two different statistics together to fill one field.**

Each field is ranked against every other player's value for the same field, so
every value has to measure the same thing. If I ask for interceptions and you
supply interceptions-plus-blocks for one player and interceptions-only for
another, the second player is compared against a number roughly twice the size
of his own and appears to be performing badly when he is merely less
documented. If a field asks for a combined figure, supply it only when you have
all of its parts.

## Comparability

- Only supply per-90 rates where the player has **at least 450 minutes** in the
  competition the figure covers. Below that, return `null` — a rate over 200
  minutes is noise that will be ranked as though it were signal.
- Prefer figures covering the player's full season. Where a player moved clubs
  mid-season and you can only find one club's figures, supply them and name that
  club in `notes`.

## Sources

For each player, list in `sources` the URLs you actually used. Preferred: FBref,
Transfermarkt, WhoScored, Sofascore, official league sites. If a value comes from
only one source and you could not corroborate it, say so in `notes` — an
uncorroborated number I know about is usable; one I do not is a trap.

## Output format

Return **only** a JSON array, no prose before or after. One object per player,
in the order given. Use exactly these key names — they are consumed by a build
script, and a key it does not recognise is never scored, so a near-miss on a
name fails silently rather than loudly.

```json
[
  {
    "id": "<the id I gave you, unchanged>",
    "dateOfBirth": "YYYY-MM-DD or null",
    "seasonUsed": "<the season I gave you, unchanged>",
    "seasonStats": {
      "appearances": null,
      "starts": null,
      "minutes": null,
      "goals": null,
      "assists": null
    },
    "clubMinutesLast12Months": null,
    "metrics": {
      "<field>": null
    },
    "sources": ["<url>", "<url>"],
    "notes": "<scope, confidence, and anything that would mislead a reader who only saw the numbers>"
  }
]
```

Notes on the shape:

- `seasonStats` covers the same competitions as `metrics`, and is how I check
  whether the 450-minute rule below was met. Supply it where you can — these are
  the easiest fields to source and they feed the model directly.
- **`clubMinutesLast12Months` is wanted for every player in every request**,
  regardless of position. See the section below — it is the field I most need
  and the one I currently have no real values for.
- There is no separate `scope` or `confidence` field. Put both in `notes`, in
  prose: which competitions and clubs the figures cover, and how confident you
  are in each. Say so plainly if a number came from a single uncorroborated
  source.
- `dateOfBirth` only matters for the five players named below as missing one.
  Leave it `null` otherwise; a value here never overrides the research file.

## `clubMinutesLast12Months` — wanted for every player, every request

**Total minutes of senior club football played in the 12 months before the
as-of date, across all competitions.** Not a season total. Not a per-90 rate. A
rolling window ending on the as-of date.

This is a different question from `seasonStats.minutes`, and the difference is
the whole point of asking. A player who was a regular until May and has not
played since scores identically to one still starting every week if all I have
is the completed season. The model uses this figure to decide how much to trust
"he keeps getting picked for Ireland, so he will be picked again" — an inference
that quietly stops holding when a player stops playing.

Worked example of why: Séamus Coleman was capped in June 2026 and played 656
international minutes in the last year, so on international evidence alone he
looks like a current starter. He also played **18 minutes** of club football all
season and is now unattached. Without a club figure the model rated him a
likely starter at right-back.

Rules:

- **Include** league, domestic cup, and continental club football. Senior only.
- **Exclude** international appearances — `seniorMinutesLast12Months` in the
  research file already covers those, and double-counting them here would
  reward a player twice for the same football.
- **Exclude** youth, reserve and academy fixtures, and pre-season friendlies.
- Cover a mid-season transfer by summing across both clubs, and say so in
  `notes`.
- `0` is a real and useful answer for a player who was fit and available but
  never got on the pitch. Say in `notes` that you confirmed it, so I can tell it
  apart from a guess.
- **`null` when no source publishes a minutes figure.** Do not derive it from
  appearances, and do not estimate it as appearances × 90 — that is precisely
  the fabrication this field exists to replace. An honest `null` leaves the
  model on its existing appearance-count fallback, which is weak but not wrong.
  An invented number silently overrides it.
- If you can only find the completed-season total and not a rolling 12-month
  one, put the season total in `seasonStats.minutes`, leave this `null`, and
  say so. Do not copy the season total into this field.

## Fields for this request

{{FIELD_LIST}}

## Players

{{PLAYER_LIST}}

---

# REQUEST FIELD LISTS

`[R2]` marks a key the round-2 research file can already supply. A value there
only takes effect where round 2 left it null — true for most players, but not
all. Keys without the marker are guaranteed to land.

## Request 1 — Goalkeeper → `player-metrics-batch-5.json`

```
savePercentage        [R2]  Share of shots on target saved, 0-100.
goalsPrevented90      [R2]  Goals conceded vs. the number an average keeper would
                            concede from the same shots, PER 90. Positive = better
                            than average. Also called post-shot xG minus goals
                            allowed (PSxG-GA). Sources usually publish this as a
                            season total: divide by minutes/90 and say so in notes.
                            A total left undivided here is scored as a rate.
longPassAccuracy      [R2]  Share of attempted long passes completed, 0-100.
crossesClaimed90            Crosses caught or punched clear, per 90.
passCompletion              Share of all attempted passes completed, 0-100.
```

## Request 2 — Defender, CB/LB/RB → `player-metrics-batch-6.json`

```
duelSuccess           [R2]  Share of ground duels won, 0-100.
aerialSuccess         [R2]  Share of aerial duels won, 0-100.
tackles90             [R2]  Tackles attempted, per 90.
interceptions90       [R2]  Interceptions only. Do NOT add blocks — see the
                            second rule above. Blocks are not wanted separately
                            either; too few players have them to rank.
clearances90          [R2]  Clearances, per 90.
progressiveDistance90       Metres of forward progress from carries and passes,
                            per 90, expressed in HUNDREDS of metres. 340m/90
                            is 3.4, not 340.
errors90                    Mistakes directly conceding a shooting opportunity,
                            PER 90 — not a season total. Lower is better; the
                            model inverts it, so do not pre-invert it yourself.
```

## Request 3 — Midfielder, DM/CM → `player-metrics-batch-7.json`

```
passCompletion        [R2]  Share of attempted passes completed, 0-100.
defensiveActions90    [R2]  Tackles AND interceptions combined, per 90. Supply
                            only if you have the provider's own combined figure,
                            or both parts to add. One part alone is not a smaller
                            composite, it is a different metric — leave it null.
progressivePasses90         Completed passes moving the ball significantly
                            towards the opposition goal, per 90.
pressures90                 Occasions applying pressure to an opponent in
                            possession, per 90.
possessionLost90            Times the player concedes possession, per 90. Lower
                            is better; the model inverts it, so supply the raw
                            count, not an inverted or "retention" figure.
```

## Request 4 — Creator, AM/W → `player-metrics-batch-8.json`

```
expectedAssists90     [R2]  xA per 90.
chancesCreated90      [R2]  Passes leading directly to a shot, per 90. Usually
                            published as "key passes".
progressiveCarries90  [R2]  Carries moving the ball meaningfully towards the
                            opposition goal, per 90.
finalThirdEntries90         Touches and receptions in the attacking third, per 90.
dribbleSuccess              Share of attempted take-ons that succeed, 0-100.
```

## Request 5 — Forward, ST → `player-metrics-batch-9.json`

```
expectedGoals90       [R2]  Non-penalty xG per 90. Plain xG is acceptable if npxG
                            is unavailable — say which in notes.
shots90               [R2]  Attempts on goal, per 90.
chanceConversion      [R2]  Share of shots that become goals, 0-100.
nonPenaltyGoals90           Goals excluding penalties, per 90.
boxTouches90                Touches inside the opposition penalty area, per 90.
```

---

# REQUEST PLAYER LISTS

Format: `id | name | position | season | club | league`

Ordered fewest-existing-metrics first, so the earliest entries are where the
model is currently most blind.

## Request 1 — Goalkeeper (8)

```
aaron-maguire      | Aaron Maguire            | GK | 2025-26 | Tottenham Hotspur U21 / Hashtag United | Premier League 2 / National League South
conor-walsh        | Conor Walsh              | GK | 2025    | Sligo Rovers            | League of Ireland Premier Division
mark-travers       | Mark Travers             | GK | 2025-26 | Everton                 | Premier League
noah-jauny         | Noah Jauny               | GK | 2025-26 | Brest                   | Ligue 1
max-oleary         | Max O'Leary              | GK | 2025-26 | Bristol City / West Bromwich Albion | EFL Championship
caoimhin-kelleher  | Caoimhín Odhrán Kelleher | GK | 2025-26 | Brentford               | Premier League
gavin-bazunu       | Gavin Bazunu             | GK | 2025-26 | Southampton / Stoke City (loan) | EFL Championship
josh-keeley        | Josh Keeley              | GK | 2025-26 | Luton Town              | EFL League One
```

## Request 2 — Defender (26)

```
alex-murphy         | Alex Murphy           | CB | 2025-26 | Newcastle United        | Premier League
cathal-heffernan    | Cathal Heffernan      | CB | 2025-26 | Newcastle United U21 / Harrogate Town | Premier League 2 / EFL League Two
conor-mcmanus       | Conor McManus         | CB | 2025-26 | Brentford B             | Professional Development League
cory-osullivan      | Cory O'Sullivan       | CB | 2025    | Shamrock Rovers         | League of Ireland Premier Division
david-okagbue       | David Okagbue         | CB | 2025-26 | Peterborough United     | EFL League One
jimmy-dunne         | Jimmy Dunne           | CB | 2025-26 | Queens Park Rangers     | EFL Championship
matt-doherty        | Matt Doherty          | RB | 2025-26 | Wolverhampton Wanderers | Premier League
oisin-gallagher     | Oisín Gallagher       | CB | 2025-26 | Boston United (loan)    | National League
sean-keogh          | Sean Keogh            | LB | 2025-26 | Brighton & Hove Albion U21 | Premier League 2
sean-grehan         | Seán Grehan           | CB | 2025-26 | Doncaster Rovers        | EFL League One
tayo-adaramola      | Tayo Adaramola        | LB | 2025-26 | Leyton Orient / Sheffield Wednesday | EFL League One / EFL Championship
will-ferry          | Will Ferry            | LB | 2025-26 | Dundee United           | Scottish Premiership
seamus-coleman      | Séamus Coleman        | RB | 2025-26 | Everton                 | Premier League
mark-mcguinness     | Mark McGuinness       | CB | 2025-26 | Luton Town / Sheffield United | EFL League One / EFL Championship
robbie-brady        | Robbie Brady          | LB | 2025-26 | Preston North End       | EFL Championship
andrew-omobamidele  | Andrew Omobamidele    | CB | 2025-26 | Strasbourg              | Ligue 1
corrie-ndaba        | Corrie Ndaba          | CB | 2025-26 | Kilmarnock / Lecce      | Scottish Premiership / Serie A
sam-curtis          | Sam Curtis            | RB | 2025-26 | Sheffield United / Chesterfield | EFL Championship / EFL League Two
dara-oshea          | Dara O'Shea           | CB | 2025-26 | Ipswich Town            | EFL Championship
ryan-manning        | Ryan Phelim Manning   | LB | 2025-26 | Southampton             | EFL Championship
festy-ebosele       | Festy Oseiwe Ebosele  | RB | 2025-26 | Istanbul Basaksehir     | Super Lig
jake-obrien         | Jake Patrick O'Brien  | CB | 2025-26 | Everton                 | Premier League
liam-scales         | Liam Scales           | CB | 2025-26 | Celtic                  | Scottish Premiership
john-egan           | John Egan             | CB | 2025-26 | Hull City               | EFL Championship
james-abankwah      | James Abankwah        | CB | 2025-26 | Watford (loan)          | EFL Championship
nathan-collins      | Nathan Collins        | CB | 2025-26 | Brentford               | Premier League
```

## Request 3 — Midfielder (18)

```
bosun-lawal            | Bosun Lawal          | DM | 2025-26 | Stoke City              | EFL Championship
darius-lipsiuc         | Darius Lipsiuc       | CM | 2025-26 | Solihull Moors (loan)   | National League
dawson-devoy           | Dawson Devoy         | CM | 2025    | Bohemians               | League of Ireland Premier Division
gabriel-kelly-gartside | Gabriel Gartside-Kelly | DM | 2025-26 | Stoke City U21        | Premier League 2
jacob-devaney          | Jacob Devaney        | DM | 2025-26 | Manchester United U21 / St Johnstone | Premier League 2 / Scottish Premiership
jamie-mullins          | Jamie Mullins        | CM | 2025-26 | Wycombe Wanderers       | EFL League One
john-osullivan-2006    | John O'Sullivan      | CM | 2025    | Shamrock Rovers / Drogheda United | League of Ireland Premier Division
josh-cullen            | Josh Cullen          | DM | 2025-26 | Burnley                 | Premier League
rory-finneran          | Rory Finneran        | DM | 2025-26 | Newcastle United U18/U19/U21 | Academy competitions
will-smallbone         | Will Smallbone       | CM | 2025-26 | Millwall (loan)         | EFL Championship
aaron-ochoa-moloney    | Aarón Ochoa Moloney  | CM | 2025-26 | Malaga                  | Segunda Division
conor-coventry         | Conor Coventry       | DM | 2025-26 | Charlton Athletic       | EFL Championship
jason-knight           | Jason Knight         | DM | 2025-26 | Bristol City            | EFL Championship
jayson-molumby         | Jayson Molumby       | DM | 2025-26 | West Bromwich Albion    | EFL Championship
joe-hodge              | Joe Hodge            | DM | 2025-26 | Tondela                 | Primeira Liga
alan-browne            | Alan Browne          | CM | 2025-26 | Sunderland / Middlesbrough | Premier League / EFL Championship
killian-phillips       | Killian Phillips     | CM | 2025-26 | St Mirren               | Scottish Premiership
jack-taylor            | Jack Taylor          | CM | 2025-26 | Ipswich Town            | EFL Championship
```

## Request 4 — Creator (22)

```
adam-brennan         | Adam Brennan          | AM | 2025    | UCD                     | League of Ireland First Division
cillian-murphy       | Cillian Murphy        | AM | 2025    | Cork City U17           | League of Ireland academy
franco-umeh-chibueze | Franco Umeh-Chibueze  | W  | 2025-26 | Portsmouth              | EFL Championship
harry-vaughan        | Harry Vaughan         | AM | 2025-26 | Hull City               | EFL Championship
harvey-vale          | Harvey Vale           | AM | 2025-26 | Queens Park Rangers     | EFL Championship
jack-moylan          | Jack Moylan           | AM | 2025-26 | Lincoln City            | EFL League One
jaden-umeh           | Jaden Umeh            | W  | 2025-26 | Benfica U19             | UEFA Youth League
kevin-zefi           | Kevin Zefi            | W  | 2025-26 | Unattached              | No competitive club football
kian-leavy           | Kian Leavy            | AM | 2025    | St Patrick's Athletic   | League of Ireland Premier Division
millenic-alli        | Millenic Alli         | W  | 2025-26 | Luton Town / Portsmouth (loan) | EFL League One / EFL Championship
naj-razi             | Naj Razi              | AM | 2025    | Como youth              | Italian youth competitions
trent-kone-doherty   | Trent Kone-Doherty    | W  | 2025-26 | Liverpool / Molde       | Premier League / Eliteserien
rocco-vata           | Rocco Vata            | W  | 2025-26 | Watford                 | EFL Championship
chiedozie-ogbene     | Chiedozie Ogbene      | W  | 2025-26 | Ipswich Town / Sheffield United | EFL Championship
kasey-mcateer        | Kasey McAteer         | W  | 2025-26 | Leicester City / Ipswich Town | EFL Championship
mikey-johnston       | Mikey Johnston        | W  | 2025-26 | West Bromwich Albion    | EFL Championship
ollie-oneill         | Oliver John O'Neill   | W  | 2025-26 | Leyton Orient           | EFL League One
andrew-moran         | Andrew Moran          | AM | 2025-26 | Los Angeles FC / Preston North End | Major League Soccer / EFL Championship
ryan-johansson       | Ryan Nils Johansson   | AM | 2025-26 | SV Wehen Wiesbaden      | 3. Liga
jamie-mcgrath        | Jamie McGrath         | AM | 2025-26 | Hibernian               | Scottish Premiership
aidomo-emakhu        | Aidomo Abraham Emakhu | W  | 2025-26 | Millwall / Oxford United | EFL Championship
finn-azaz            | Finn Azaz             | AM | 2025-26 | Middlesbrough / Southampton | EFL Championship
```

## Request 5 — Forward (15)

```
kian-mcmahon-brown | Kian McMahon-Brown   | ST | 2025-26 | Burnley U18/U21         | Academy competitions
michael-noonan     | Michael Noonan       | ST | 2025    | Shamrock Rovers         | League of Ireland Premier Division
sean-patton        | Sean Patton          | ST | 2025-26 | Reading / Aldershot Town (loan) | EFL League One / National League
tommy-lonergan     | Tommy Lonergan       | ST | 2025    | Waterford               | League of Ireland Premier Division
victor-ozhianvuna  | Victor Ozhianvuna    | ST | 2025    | Shamrock Rovers         | League of Ireland Premier Division
gbemi-arubi        | Gbemi Kingslyn Arubi | ST | 2025    | Dundalk                 | League of Ireland First Division
mason-melia        | Mason Melia          | ST | 2025    | St Patrick's Athletic   | League of Ireland Premier Division
adam-idah          | Adam Idah            | ST | 2025-26 | Celtic / Swansea City   | Scottish Premiership / EFL Championship
sammie-szmodics    | Sammie Szmodics      | ST | 2025-26 | Ipswich Town / Derby County | EFL Championship
callum-robinson    | Callum Robinson      | ST | 2025-26 | Cardiff City            | EFL League One
johnny-kenny       | Johnny Kenny         | ST | 2025-26 | Celtic / Bolton Wanderers | Scottish Premiership
tom-cannon         | Tom Cannon           | ST | 2025-26 | Sheffield United        | EFL Championship
troy-parrott       | Troy Daniel Parrott  | ST | 2025-26 | AZ                      | Eredivisie
sinclair-armstrong | Sinclair Armstrong   | ST | 2025-26 | Bristol City            | EFL Championship
evan-ferguson      | Evan Ferguson        | ST | 2025-26 | Brighton & Hove Albion / Roma | Premier League / Serie A
```

---

# DEFERRED — historical seasons (needs a code change first)

Only 47% of season records carry any metric, and the gap widens going back:
54/84 players for the most recent season, 29/83 one season back, 31/78 two back.
The app computes a *trend* from those three points, so for most players an
improving or declining label rests on comparing one measured season against two
that fell back to a neutral score. Filling prior seasons for players who already
have current-season data would do more for trend credibility than adding new
metric types.

**Do not commission this yet.** The build script has nowhere to put it. A batch
entry is keyed by player id alone, and its `metrics` are attached
unconditionally to that player's `lastCompletedSeason` slot:

```js
const lastSeason = buildSeasonRecord(p.lastCompletedSeason, batch?.seasonStats, lastSeasonMetrics, …)
const previousSeason = buildSeasonRecord(p.previousSeason, null, null, …)
const thirdSeason    = buildSeasonRecord(p.thirdMostRecentSeason, null, null, …)
```

The two older slots are passed `null` for both stats and metrics, and the
`seasonUsed` field in a batch entry is never read. So a 2024-25 figure supplied
today would not fill the 2024-25 record — it would overwrite, or be discarded
against, the current-season one. The trend would move for the wrong reason,
which is worse than a flat trend.

Two changes are needed first: batch entries keyed by `id` *and* season, and
`buildSeasonRecord` wired to look up the matching entry for each of the three
slots. Once that exists, this request becomes the same prompt with the season
column changed, plus:

> For each player I have given you three seasons. Treat each season as a
> separate object in the output array, with its own `seasonUsed`, `seasonStats`
> and `sources`. Do not carry a value from one season into another. A season you
> cannot document is an object whose metrics are all `null` — that is a useful
> answer, not a failed one.

Start with the players whose current season is already well covered, since a
trend needs at least two measured points to mean anything: `nathan-collins`,
`james-abankwah`, `evan-ferguson`, `sinclair-armstrong`, `finn-azaz`,
`aidomo-emakhu`, `jack-taylor`, `killian-phillips`, `josh-keeley`,
`caoimhin-kelleher`.
