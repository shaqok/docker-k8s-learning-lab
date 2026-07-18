---
name: add-ko-strings
description: Find English teaching notes added to the diff that have no Korean translation, and append the [EN, KO] pairs to KO_STR in src/i18n/dynamic.js.
---

# Add missing KO string pairs

The trainer is bilingual. Every teaching note reaching the terminal needs an
`[EN, KO]` entry in the `KO_STR` array of `src/i18n/dynamic.js`, which `tr()`
walks at render time. Nothing enforces this, so notes ship untranslated.

## 1. Find the candidates

Read the diff (`git diff`, `git diff --staged`) and collect every new or
changed user-facing English string under `src/sims/`, `src/data/`,
`src/modules/` and `src/components/`.

## 2. Classify — this is the part that matters

**Simulated command output stays English on purpose.** Real `docker` and
`kubectl` speak English, and a student who learns to recognize a translated
error message learns nothing transferable.

Translate only:
- narrator asides and teaching notes (typically printed with a `note`/`hint` class)
- mission descriptions, panel labels, button text
- simulator meta-messages about the simulation itself
  (`(interactive shells aren't simulated — …)`)

Leave in English:
- table rows, headers, resource listings
- real CLI error strings (`Error from server (NotFound): …`)
- anything a real tool would print verbatim

When unsure, ask: would the real tool print this? If yes, don't translate it.

## 3. Check what already exists

For each candidate, grep `src/i18n/dynamic.js` for a distinctive fragment
before adding — the array is long and duplicates are easy to introduce.

## 4. Write the pair

Plain string:

```js
["English text here","한국어 번역"],
```

If the string interpolates a value, use the regex form with `$1`-style
backreferences and a `/g` flag — and verify the regex actually matches the
emitted string, including any punctuation and emoji:

```js
[/← your container answered on port (\d+) 🎉/g,"← 컨테이너가 $1 포트에서 응답했습니다 🎉"],
```

Match the register of the existing entries: polite learner-facing Korean with
-요/-습니다 endings; keep command names, flags, resource kinds and product
names in English inside the Korean sentence (`docker run -d`, `kubectl`,
`ImagePullBackOff`); preserve the original's em-dashes and emoji.

Append near related entries rather than blindly at the end, so the file stays
grouped by topic.

## 5. Verify

- `<none>` and other angle-bracket placeholders must be written `&lt;none&gt;`
  in anything rendered as HTML (`Terminal.print()`, `Html.jsx`).
- `npm test` — the bilingual-content assertions in the lab suites will catch
  missing `desc.ko` fields.
- Report which strings you deliberately left English and why.
