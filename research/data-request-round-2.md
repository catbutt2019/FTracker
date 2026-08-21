# Research round 2 — data request

Purpose: five of the eleven `SeniorStatus` fields are 0% populated across all 84
tracked players, which leaves one of the five positional-risk dimensions
(`availabilityRisk`) structurally unable to ever fire, and forces
`hasSeniorAppearance` to run off a `seniorCaps` proxy rather than the
appearance/start fields the category rules are actually written against.

This round asks for **missing fields on players already in the dataset**, not for
more players. The one exception is the coverage check in section C.

Paste the prompt below into ChatGPT (or another research assistant with web
access), one position group at a time. Do not paste all 84 players at once —
accuracy collapses and you cannot tell which answers were verified.

---

## The prompt

> You are helping me fill gaps in a football dataset. I need verifiable facts
> with sources, not estimates.
>
> **Context.** I maintain a progression-tracking model for Republic of Ireland
> men's senior-eligible footballers. Every number feeds an auditable model, so a
> plausible-looking guess is worse than an admission of ignorance: a wrong value
> silently changes a risk verdict, whereas a null correctly lowers the model's
> stated confidence.
>
> **The single most important rule.** If you cannot find a value in a citable
> source, return `null` for that field. Do not infer, interpolate, estimate,
> round from memory, or carry a value over from a similar player. Do not return
> `0` to mean "unknown" — `0` means the genuine, sourced value is zero. I would
> rather receive a record that is 80% nulls than one plausible fabrication,
> because I have no way to detect the latter.
>
> **As-of date.** All "last 12 months" and "current" values are as of
> **2026-08-21**. State this date in your output. If your information is older
> than that, say so explicitly per player rather than presenting stale data as
> current.
>
> **For each player listed at the end, return these fields:**
>
> | Field | Type | Meaning |
> |---|---|---|
> | `seniorCaps` | integer \| null | Total senior Republic of Ireland caps |
> | `seniorStarts` | integer \| null | Of those caps, how many were starts |
> | `competitiveSeniorStarts` | integer \| null | Starts in competitive (non-friendly) senior fixtures only |
> | `seniorMinutes` | integer \| null | Career senior international minutes |
> | `seniorMinutesLast12Months` | integer \| null | Senior international minutes since 2025-08-21 |
> | `lastSeniorAppearanceDate` | ISO date \| null | Most recent senior appearance of any kind |
> | `lastSeniorStartDate` | ISO date \| null | Most recent senior appearance as a starter |
> | `recentSquadCallups` | integer \| null | Senior squad call-ups since 2025-08-21, whether or not he played |
> | `clubMinutesLast12Months` | integer \| null | Club league+cup minutes since 2025-08-21 |
> | `availabilityStatus` | `"available"` \| `"injured"` \| `"unavailable"` \| null | Current status. `"unavailable"` covers suspension, personal leave, or being out of the squad for non-injury reasons. Use `null` if you cannot confirm — do **not** default to `"available"` |
> | `expectedReturnDate` | ISO date \| null | If injured, expected return |
> | `injuryDaysLast24Months` | integer \| null | Total days unavailable through injury since 2024-08-21 |
> | `contractExpiry` | ISO date \| null | Current club contract expiry |
>
> **Output format.** A JSON array, one object per player, each with `id` (the
> slug I give you), `name`, the fields above, and:
>
> - `sources`: array of `{ "field": "...", "url": "...", "accessed": "2026-08-21" }`
>   — one entry per non-null field. A non-null field with no source is not
>   acceptable; downgrade it to `null` instead.
> - `confidence`: `"high" | "medium" | "low"` for the record overall
> - `notes`: anything ambiguous — conflicting sources, a player who has switched
>   allegiance, youth caps being conflated with senior caps, a transfer that may
>   not have completed
>
> **Traps I have already been caught by, so please be careful:**
>
> 1. **Youth caps counted as senior caps.** U21 and U19 appearances must not
>    appear in `seniorCaps`. If a source does not distinguish them, return
>    `null` and say so in `notes`.
> 2. **Friendlies counted as competitive.** `competitiveSeniorStarts` excludes
>    friendlies. Nations League, Euro/World Cup qualifiers and finals count.
> 3. **Appearances vs starts.** A substitute appearance is a cap but not a
>    start. If a source only gives total appearances, populate `seniorCaps` and
>    leave `seniorStarts` null.
> 4. **Squad lists vs actual selection.** `recentSquadCallups` counts being
>    named in a squad, which is different from playing.
> 5. **Stale injury data.** An injury reported six months ago says nothing about
>    today. If you cannot confirm the player's status within roughly the last
>    two weeks, `availabilityStatus` is `null`.
>
> Here are the players:
>
> [paste one position group from the roster below]

---

## C. Coverage check (separate question, ask once)

The dataset currently tracks only **4 right-backs and 4 left-backs** primary,
against 17 centre-backs and 27 midfielders. The model flags full-back as a
moderate-risk group, but with a pool that thin it cannot distinguish "Ireland is
short of full-backs" from "this research pass under-covered full-backs". Same
question for goalkeeper, where 7 are tracked but only one clears the
senior-ready score.

Ask separately:

> Which senior-eligible Republic of Ireland full-backs (right or left) and
> goalkeepers currently playing first-team football are **not** in this list?
> Include anyone with a plausible senior claim: capped players, uncapped players
> playing regularly in the top four English tiers, the League of Ireland
> Premier Division, or any European top division, and declared-eligible players
> at academy level who are getting senior minutes. For each, give name, date of
> birth, current club, league, and the eligibility route (born in Ireland,
> parent/grandparent, residency), with a source.
>
> [paste the GK, RB and LB entries from the roster]

---

## Roster

Format: `name | primary position | current club | date of birth | senior caps currently recorded`

The caps figure is what the dataset currently holds — treat it as the value to
verify, not as ground truth.


### Goalkeeper (7)

```
caoimhin-kelleher | Caoimhín Odhrán Kelleher | GK | Brentford | 1998-11-23 | caps 31
conor-walsh | Conor Walsh | GK | Shelbourne | 2005-03-17 | caps 0
gavin-bazunu | Gavin Bazunu | GK | Southampton | 2002-02-20 | caps 22
josh-keeley | Josh Keeley | GK | Luton Town | 2003-05-17 | caps 0
mark-travers | Mark Travers | GK | Everton | 1999-05-18 | caps 0
max-oleary | Max O’Leary | GK | West Bromwich Albion | 1996-10-10 | caps 2
noah-jauny | Noah Jauny | GK | Royal Francs Borains | 2004-08-26 | caps 0
```

### Full-back (8)

```
festy-ebosele | Festy Oseiwe Ebosele | RB | Erzurumspor FK | 2002-08-02 | caps 0
matt-doherty | Matt Doherty | RB | Sheffield United | 1992-01-16 | caps 53
sam-curtis | Sam Curtis | RB | Sheffield United | 2005-12-01 | caps 0
seamus-coleman | Séamus Coleman | RB | unattached / free agent | 1988-10-11 | caps 81
robbie-brady | Robbie Brady | LB | unattached / free agent | 1992-01-14 | caps 0
ryan-manning | Ryan Phelim Manning | LB | Southampton | 1996-06-14 | caps 23
tayo-adaramola | Tayo Adaramola | LB | Cercle Brugge | 2003-11-14 | caps 1
will-ferry | Will Ferry | LB | Dundee United | 2000-12-07 | caps 1
```

### Centre-back (17)

```
alex-murphy | Alex Murphy | CB | 1. FC Kaiserslautern | 2004-06-25 | caps 0
andrew-omobamidele | Andrew Omobamidele | CB | Strasbourg | 2002-06-23 | caps 10
cathal-heffernan | Cathal Heffernan | CB | Harrogate Town | 2005-04-27 | caps 0
conor-mcmanus | Conor McManus | CB | Gillingham | 2004-06-16 | caps 0
corrie-ndaba | Corrie Ndaba | CB | Lecce | 1999-12-25 | caps 0
cory-osullivan | Cory O'Sullivan | CB | Shamrock Rovers | 2006-05-02 | caps 0
dara-oshea | Dara O'Shea | CB | Ipswich Town | 1999-03-04 | caps 45
david-okagbue | David Okagbue | CB | Peterborough United | 2004-02-04 | caps 0
jake-obrien | Jake Patrick O'Brien | CB | Everton | 2001-05-15 | caps 17
james-abankwah | James Abankwah | CB | Udinese | 2004-01-16 | caps None
jimmy-dunne | Jimmy Dunne | CB | Queens Park Rangers | 1997-10-19 | caps 3
john-egan | John Egan | CB | Hull City | 1992-10-20 | caps 36
liam-scales | Liam Scales | CB | Celtic | 1998-08-08 | caps 16
mark-mcguinness | Mark McGuinness | CB | Sheffield United | 2001-01-05 | caps 2
nathan-collins | Nathan Collins | CB | Brentford | 2001-04-30 | caps 40
oisin-gallagher | Oisín Gallagher | CB | Lincoln City | 2004-12-02 | caps 0
sean-grehan | Seán Grehan | CB | Doncaster Rovers | 2004-01-08 | caps 0
```

### Midfield (27)

```
bosun-lawal | Bosun Lawal | DM | Stoke City | 2003-05-30 | caps 1
conor-coventry | Conor Coventry | DM | Charlton Athletic | 2000-03-25 | caps 0
gabriel-kelly-gartside | Gabriel Gartside-Kelly (reported in some sources as Gabriel Kelly) | DM | Stoke City | 2006-12-19 | caps 0
jacob-devaney | Jacob Devaney | DM | Manchester United U21 | 2007-06-11 | caps 0
jason-knight | Jason Knight | DM | Bristol City | 2001-02-13 | caps 41
jayson-molumby | Jayson Molumby | DM | West Bromwich Albion | 1999-08-06 | caps 0
joe-hodge | Joe Hodge | DM | Motherwell | 2002-09-14 | caps 0
josh-cullen | Josh Cullen | DM | Burnley | 1996-04-07 | caps 47
rory-finneran | Rory Finneran | DM | Newcastle United U21 | 2008-02-29 | caps 1
aaron-ochoa-moloney | Aarón Ochoa Moloney | CM | Málaga CF | 2007-04-18 | caps 0
alan-browne | Alan Browne | CM | Sunderland | 1995-07-22 | caps 0
dawson-devoy | Dawson Devoy | CM | Bohemians | 2001-11-20 | caps 0
jack-taylor | Jack Taylor | CM | Ipswich Town | 1998-06-23 | caps 0
jamie-mullins | Jamie Mullins | CM | Wycombe Wanderers | 2004-09-29 | caps 0
john-osullivan-2006 | John O'Sullivan (also reported as John O'Reilly-O'Sullivan) | CM | Shamrock Rovers | 2006-01-29 | caps 0
killian-phillips | Killian Phillips | CM | St Mirren | 2002-03-30 | caps 0
will-smallbone | Will Smallbone | CM | Unattached | 2000-02-21 | caps 15
adam-brennan | Adam Brennan | AM | Shamrock Rovers | 2007-05-29 | caps 0
andrew-moran | Andrew Moran | AM | Preston North End | 2003-10-15 | caps 3
cillian-murphy | Cillian Murphy | AM | Cork City | 2009-07-22 | caps 0
finn-azaz | Finn Azaz | AM | Southampton | 2000-09-07 | caps 7
harry-vaughan | Harry Vaughan | AM | Bohemians | 2004-04-06 | caps 0
harvey-vale | Harvey Vale | AM | Queens Park Rangers | 2003-09-11 | caps 2
jack-moylan | Jack Moylan | AM | Cardiff City | 2001-09-01 | caps 2
jamie-mcgrath | Jamie McGrath | AM | Hibernian | 1996-09-30 | caps 0
kian-leavy | Kian Leavy | AM | St Patrick’s Athletic | 2002-03-21 | caps 1
ryan-johansson | Ryan Nils Johansson | AM | SC Preußen Münster | 2001-02-15 | caps 0
```

### Wide (11)

```
aidomo-emakhu | Aidomo Abraham Emakhu | W | Oxford United | 2003-10-26 | caps 0
chiedozie-ogbene | Chiedozie Ogbene | W | Ipswich Town | 1997-05-01 | caps 24
franco-umeh-chibueze | Franco Umeh-Chibueze | W | Portsmouth | 2005-02-26 | caps 0
jaden-umeh | Jaden Umeh | W | Benfica | 2008-03-18 | caps 2
kasey-mcateer | Kasey McAteer | W | Ipswich Town | 2001-11-22 | caps 8
kevin-zefi | Kevin Zefi | W | Sligo Rovers | 2005-02-11 | caps 0
mikey-johnston | Mikey Johnston | W | West Bromwich Albion | 1999-04-19 | caps 19
millenic-alli | Millenic Alli | W | Charlton Athletic | 2000-02-06 | caps 1
ollie-oneill | Oliver John O'Neill | W | Leyton Orient | 2003-01-08 | caps 0
rocco-vata | Rocco Vata | W | Watford | 2005-04-18 | caps 10
trent-kone-doherty | Trent Kone-Doherty | W | Molde FK | 2006-06-30 | caps 0
```

### Forward (14)

```
adam-idah | Adam Idah | ST | Swansea City | 2001-02-11 | caps 39
callum-robinson | Callum Robinson | ST | Cardiff City | 1995-02-02 | caps 38
evan-ferguson | Evan Ferguson | ST | Brighton & Hove Albion | 2004-10-19 | caps 0
gbemi-arubi | Gbemi Kingslyn Arubi | ST | Burton Albion | 2004-05-26 | caps 0
johnny-kenny | Johnny Kenny | ST | Celtic | 2003-06-06 | caps 0
mason-melia | Mason Melia | ST | Lincoln City | 2007-09-22 | caps 2
michael-noonan | Michael Noonan | ST | Shamrock Rovers | 2008-07-31 | caps 0
sammie-szmodics | Sammie Szmodics | ST | Derby County | 1995-09-24 | caps 12
sean-patton | Sean Patton | ST | Reading | 2006-07-25 | caps 0
sinclair-armstrong | Sinclair Armstrong | ST | Göztepe | 2003-06-22 | caps 1
tom-cannon | Tom Cannon | ST | Sheffield United | 2002-12-28 | caps 0
tommy-lonergan | Tommy Lonergan | ST | Waterford FC | 2004-01-02 | caps 0
troy-parrott | Troy Daniel Parrott | ST | Real Betis | 2002-02-04 | caps 37
victor-ozhianvuna | Victor Ozhianvuna | ST | Shamrock Rovers | 2009-01-10 | caps 0
```
