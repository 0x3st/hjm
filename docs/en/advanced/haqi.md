# HaQi Difficulty System

PoW difficulty is expressed as "HaQi value" — essentially the number of leading zero trits.

| Concept | Formula | Description |
|---------|---------|-------------|
| HaQi Value H | — | Leading zero trit count, consensus variable |
| HaQi Level | `floor(H / 3)` | Display tier |
| HaQi Point | `H % 3` | Display remainder |
| HaQi Pressure | `3^H` | Work magnitude (display value) |

Each +1 to H increases expected computation cost by ~3x.
