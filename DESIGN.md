# Design direction

Reading this as: a responsive operations console for a solo freelancer, with a warm architectural workspace language, dial ENERGY 2 / RHYTHM 2 / MOTION 1.

- **Palette:** chalk and ink neutrals carry long-form project text; deep pine identifies the workspace; copper is reserved for the main action and focus moments.
- **Typography:** the locally available Segoe UI/Aptos system sans keeps dense project and policy details readable without a remote font request; Georgia headings add the editorial character of a personal office.
- **Layout:** a compact room directory stays available while the opportunity queue takes the largest area, because the user's main job is deciding what work to act on next.
- **Motif:** room labels and a narrow copper rule echo a physical studio index and recur only at actual section boundaries.
- **Cards:** the opportunity list is a continuous queue; only policy and account states use bounded panels because those need a distinct operational boundary.
- **Motion:** state changes use short transitions; no looping animation or motion-dependent content. Reduced-motion preferences remove transitions.
- **3D:** an optional low-poly room represents the five actual departments and links each zone to its corresponding 2D work queue. It never performs marketplace actions.

## Interaction contract

Every navigation item opens a real route. Every action reports its result in the page and is keyboard reachable. The only marketplace action in demo mode is a clearly labeled simulation that writes an audit record and leaves external bid state unchanged.
