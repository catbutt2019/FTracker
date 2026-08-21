# Data request prompt (for ChatGPT or another research assistant)

Roughly three-quarters of the scoring model's designed weight is currently
unpopulated. This file holds a ready-to-paste prompt for collecting the missing
fields, plus the batch lists to paste with it.

Run it **one batch at a time**. A single request covering all 84 players
produces either truncated output or invented numbers, which is worse than no
data at all — see the null-honesty rules in the prompt.

## Batch order

Batches are ordered by how much scoring weight each one unlocks per player
researched, not by squad importance.

| # | Group | Players | Weight currently unpopulated |
|---|-------|---------|------------------------------|
| 1 | Goalkeeper | 8 | 86% |
| 2 | Defender | 26 | 76% |
| 3 | Midfielder | 18 | 81% |
| 4 | Creator (AM/W) | 22 | 72% |
| 5 | Forward (ST) | 15 | 61% |

## Ask for these five dates of birth first

`scripts/build-real-players.mjs` drops any player with no usable date of birth,
so five of the 89 players below never reach the model at all. Researching their
metrics is wasted work until a birth date is found — and one of them sits in
each batch, so it is worth clearing in a single request before starting:

```
aaron-maguire       Aaron Maguire        GK  Tottenham Hotspur U21 / Hashtag United
sean-keogh          Sean Keogh           LB  Brighton & Hove Albion U21
darius-lipsiuc      Darius Lipsiuc       CM  Solihull Moors (loan from Luton Town)
naj-razi            Naj Razi             AM  Como youth
kian-mcmahon-brown  Kian McMahon-Brown   ST  Burnley U18/U21
```

Same null rule applies: an unfound birth date is `null`, never an estimate from
an age or a youth-team year group.

## Known mapping work on our side

Some requested keys have no mapping in `scripts/build-real-players.mjs` yet, so
supplying them is necessary but not sufficient — the build script needs a line
adding for each. Marked **(needs mapping)** in the prompt below. Two notes:

- `errorsLeadingToGoal` and `possessionsWonFinalThirdPer90` already exist in the
  round-2 schema but are null for every player *and* unmapped.
- The existing `goalsPrevented` key is mapped straight into the model's
  `goalsPrevented90`, which is a per-90 metric. If a season total ever arrives
  in that key it will be scored as a rate. The prompt therefore asks for
  `goalsPreventedPer90` explicitly.

---

# THE PROMPT

Copy everything below the line, replacing `{{GROUP}}`, `{{FIELD_LIST}}` and
`{{PLAYER_LIST}}` from the batch sections that follow.

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
  supply it, but say which in the `scope` field.
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
  club in `scope`.

## Sources

For each player, list the URLs you actually used. Preferred: FBref,
Transfermarkt, WhoScored, Sofascore, official league sites. If a value comes
from only one source and you could not corroborate it, set
`"confidence": "low"`.

## Output format

Return **only** a JSON array, no prose before or after. One object per player,
in the order given. Use exactly these key names — they are consumed by a build
script and unrecognised keys are discarded.

```json
[
  {
    "id": "<the id I gave you, unchanged>",
    "fullName": "<the name I gave you, unchanged>",
    "season": "<the season I gave you, unchanged>",
    "scope": "<competition(s) and club(s) the metrics below cover>",
    "minutes": null,
    "appearances": null,
    "starts": null,
    "metrics": {
      "<field>": null
    },
    "confidence": "high | medium | low",
    "sources": ["<url>", "<url>"],
    "notes": "<anything that would mislead a reader who only saw the numbers>"
  }
]
```

`minutes`, `appearances` and `starts` are for the same scope as the metrics, and
are how I check whether the 450-minute rule was met. Supply them where you can.

## Fields for this batch

{{FIELD_LIST}}

## Players

{{PLAYER_LIST}}

---

# BATCH FIELD LISTS

## Batch 1 — Goalkeeper

```
savePercentage              Share of shots on target saved, 0-100.
goalsPreventedPer90         Goals conceded vs. the number an average keeper would
                            concede from the same shots, per 90. Positive = better
                            than average. Also called post-shot xG minus goals
                            allowed (PSxG-GA). If your source gives a season total,
                            divide by minutes/90 and say so in notes.
longBallAccuracyPercentage  Share of attempted long passes completed, 0-100.
crossesClaimedPer90         Crosses caught or punched clear, per 90.        (needs mapping)
passCompletionPercentage    Share of all attempted passes completed, 0-100. (needs mapping)
```

## Batch 2 — Defender (CB, LB, RB)

```
groundDuelWinPercentage     Share of ground duels won, 0-100.
aerialDuelWinPercentage     Share of aerial duels won, 0-100.
tacklesPer90                Tackles attempted, per 90.
interceptionsPer90          Interceptions only. Do NOT add blocks.
clearancesPer90             Clearances, per 90.
errorsLeadingToGoal         Count of errors directly leading to a goal or shot,
                            as a SEASON TOTAL (not per 90).           (needs mapping)
progressiveDistancePer90    Metres of forward progress from carries and passes,
                            per 90, in hundreds of metres.            (needs mapping)
```

## Batch 3 — Midfielder (DM, CM)

```
passCompletionPercentage        Share of attempted passes completed, 0-100.
progressivePassesPer90          Completed passes moving the ball significantly
                                towards the opposition goal, per 90.  (needs mapping)
pressuresPer90                  Occasions applying pressure to an opponent in
                                possession, per 90.                   (needs mapping)
possessionLostPer90             Times the player concedes possession, per 90.
                                Lower is better.                      (needs mapping)
tacklesPlusInterceptionsPer90   Combined. Only if you have BOTH parts.
tacklesPer90                    Supply separately as well, if available.
interceptionsPer90              Supply separately as well, if available.
```

## Batch 4 — Creator (AM, W)

```
expectedAssistsPer90        xA per 90.
keyPassesPer90              Passes leading directly to a shot, per 90.
progressiveCarriesPer90     Carries moving the ball meaningfully towards the
                            opposition goal, per 90.
touchesFinalThirdPer90      Touches and receptions in the attacking third,
                            per 90.                                   (needs mapping)
dribbleSuccessPercentage    Share of attempted take-ons that succeed,
                            0-100.                                    (needs mapping)
```

## Batch 5 — Forward (ST)

```
nonPenaltyGoalsPer90            Goals excluding penalties, per 90.     (needs mapping)
nonPenaltyExpectedGoalsPer90    npxG per 90.
shotsPer90                      Attempts on goal, per 90.
touchesInBoxPer90               Touches inside the opposition penalty
                                area, per 90.                         (needs mapping)
shotConversionPercentage        Share of shots that become goals, 0-100.
```

---

# BATCH PLAYER LISTS

Format: `id | name | position | season | club | league`

Ordered fewest-existing-metrics first, so the earliest entries are where the
model is currently most blind.

## Batch 1 — Goalkeeper (8)

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

## Batch 2 — Defender (26)

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

## Batch 3 — Midfielder (18)

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

## Batch 4 — Creator (22)

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

## Batch 5 — Forward (15)

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

# OPTIONAL BATCH 6 — historical seasons

Only 47% of season records carry any metric, and the gap widens going back:
54/84 players for the most recent season, 29/83 one season back, 31/78 two back.
The app computes a *trend* from those three points, so for most players an
improving or declining label rests on comparing one measured season against two
that fell back to a neutral score.

Filling prior seasons for players who already have current-season data would do
more for trend credibility than adding new metric types. Use the same prompt,
same fields, but ask for the **2024-25 and 2023-24** seasons, and add:

> For each player I have given you three seasons. Treat each season as a
> separate object in the output array, with its own `scope`, `minutes` and
> `sources`. Do not carry a value from one season into another. A season you
> cannot document is an object whose metrics are all `null` — that is a useful
> answer, not a failed one.

Start with the players whose current season is already well covered, since a
trend needs at least two measured points to mean anything: `nathan-collins`,
`james-abankwah`, `evan-ferguson`, `sinclair-armstrong`, `finn-azaz`,
`aidomo-emakhu`, `jack-taylor`, `killian-phillips`, `josh-keeley`,
`caoimhin-kelleher`.
