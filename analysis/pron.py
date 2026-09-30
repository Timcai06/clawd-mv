"""Display token -> pronunciation spelling used for CTC alignment.

Each display token (lyric line split on spaces) maps to one or more
pronunciation sub-words made of plain letters (and internal apostrophes).
"""
import re

PRON = {
    "cache": "cash",
    "commit": "com mit",
    "AGI": "ay gee i",
    "P(doom)": "pee doom", "P(doom),": "pee doom",
    "ChatGPT,": "chat gee pee tee",
    "FOOM": "foom",
    "NVDA": "en vee dee ay",
    "E": "ee",
    "MLP,": "em el pee",
    "CDR": "see dee are",
    "PTO": "pee tee oh",
    "GPU": "gee pee you",
    "RLHF": "are el aitch eff",
    "Killswitch": "kill switch",
    "Neumann's": "noymans",
    "shoggoth's": "shoggoths",
    "Post-Chinchilla,": "post chinchilla",
    "super-dense": "super dense",
    "pre-training": "pre training",
    "self-upgrade": "self upgrade",
    "'cause": "cause",
    "Gato,": "gato",
}

# alternative pronunciations to test (scored by alignment likelihood)
ALT = {
    "NVDA": ["en vee dee ay", "envidia", "nvidia"],
    "Neumann's": ["noymans", "newmans"],
    "Gato,": ["gato", "gahtoe"],
}


def display_text(text: str) -> str:
    """Keep sung spelling in the source file and display spelling in output."""
    return re.sub(r"\bcash\b", "cache", text, flags=re.IGNORECASE)


def pron(token: str) -> list[str]:
    if token in PRON:
        return PRON[token].split()
    w = token.lower()
    w = w.replace("’", "'")
    clean = w.strip('.,!?;:"“”\' ')
    if clean in PRON:
        return PRON[clean].split()
    w = re.sub(r"[^a-z' ]", " ", w)
    w = w.strip("' ")
    return [p.strip("'") for p in w.split() if p.strip("'")]


if __name__ == "__main__":
    import common
    common.configure_cli()
    for _, _, t in common.load_lyrics_src():
        print(t, "->", " | ".join(" ".join(pron(w)) for w in t.split(" ")))
