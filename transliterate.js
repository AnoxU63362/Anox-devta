// transliterate.js
export const HALANT = '\u094D';

export const DEVANAGARI_MAP = new Map([
    // Vowels
    ['\u0905', 'A'], ['\u0906', 'Aa'], ['\u0907', 'I'], ['\u0908', 'Ee'],
    ['\u0909', 'U'], ['\u090A', 'Oo'], ['\u090B', 'Ri'], ['\u090F', 'E'],
    ['\u0910', 'Ai'], ['\u0913', 'O'], ['\u0914', 'Au'],

    // Consonants
    ['\u0915', 'K'], ['\u0916', 'Kh'], ['\u0917', 'G'], ['\u0918', 'Gh'],
    ['\u0919', 'Ng'], ['\u091A', 'Ch'], ['\u091B', 'Chh'], ['\u091C', 'J'],
    ['\u091D', 'Jh'], ['\u091E', 'Ny'],
    ['\u091F', 'T'], ['\u0920', 'Th'], ['\u0921', 'D'], ['\u0922', 'Dh'],
    ['\u0923', 'N'],
    ['\u0924', 'T'], ['\u0925', 'Th'], ['\u0926', 'D'], ['\u0927', 'Dh'],
    ['\u0928', 'N'],
    ['\u092A', 'P'], ['\u092B', 'Ph'], ['\u092C', 'B'], ['\u092D', 'Bh'],
    ['\u092E', 'M'],
    ['\u092F', 'Y'], ['\u0930', 'R'], ['\u0932', 'L'], ['\u0935', 'V'],
    ['\u0936', 'Sh'], ['\u0937', 'Sh'], ['\u0938', 'S'], ['\u0939', 'H'],

    // Nukta
    ['\u0958', 'Q'], ['\u0959', 'Kh'], ['\u095A', 'G'], ['\u095B', 'Z'],
    ['\u095C', 'R'], ['\u095D', 'Rh'], ['\u095E', 'F'], ['\u095F', 'Y'],

    // Matras
    ['\u093E', 'a'], ['\u093F', 'i'], ['\u0940', 'ee'],
    ['\u0941', 'u'], ['\u0942', 'oo'], ['\u0943', 'ri'],
    ['\u0947', 'e'], ['\u0948', 'ai'], ['\u094B', 'o'], ['\u094C', 'au'],

    // Modifiers
    ['\u0902', 'n'], ['\u0903', 'h'], ['\u0901', 'n'],

    // Virama
    ['\u094D', ''],

    // Digits
    ['\u0966', '0'], ['\u0967', '1'], ['\u0968', '2'], ['\u0969', '3'],
    ['\u096A', '4'], ['\u096B', '5'], ['\u096C', '6'], ['\u096D', '7'],
    ['\u096E', '8'], ['\u096F', '9'],

    // Common conjuncts
    ['\u0915\u094D\u0937', 'Ksh'],
    ['\u0924\u094D\u0930', 'Tr'],
    ['\u091C\u094D\u091E', 'Gya'],
    ['\u0936\u094D\u0930', 'Shr'],
    ['\u0926\u094D\u092F', 'Dy'],
    ['\u0926\u094D\u0935', 'Dv'],
    ['\u0926\u094D\u0930', 'Dr'],
    ['\u092A\u094D\u0930', 'Pr'],
    ['\u092C\u094D\u0930', 'Br'],
    ['\u0915\u094D\u0930', 'Kr'],
    ['\u0917\u094D\u0930', 'Gr'],
    ['\u092A\u094D\u0932', 'Pl'],
    ['\u0938\u094D\u0935', 'Sv'],
    ['\u0938\u094D\u092F', 'Sy'],
    ['\u0928\u094D\u0926', 'Nd'],
    ['\u0928\u094D\u0927', 'Ndh'],
    ['\u092E\u094D\u092C', 'Mb'],
    ['\u092E\u094D\u092A', 'Mp'],
    ['\u0919\u094D\u0915', 'Nk'],
    ['\u0919\u094D\u0917', 'Ng'],
]);

export function devanagariToLatin(text) {
    if (!text || !/[\u0900-\u097F]/.test(text)) {
        return text;
    }

    let result = '';
    let i = 0;

    while (i < text.length) {
        let matched = false;

        // Longest match first
        for (const [dev, latin] of DEVANAGARI_MAP) {
            if (dev.length >= 3 && text.startsWith(dev, i)) {
                result += latin;
                i += dev.length;
                matched = true;
                break;
            }
        }

        if (matched) continue;

        const char = text[i];

        if (DEVANAGARI_MAP.has(char)) {
            result += DEVANAGARI_MAP.get(char);
        } else {
            result += char;
        }

        i++;
    }

    return result;
}

export function transliterateName(text) {
    if (!text) return '';

    let latin = devanagariToLatin(String(text));

    // Spaces normalize
    latin = latin.replace(/\s+/g, ' ').trim();

    // Common transliteration cleanup
    latin = latin
        .replace(/Kshh/gi, 'Ksh')
        .replace(/Shh/gi, 'Sh')
        .replace(/Ph/gi, 'Ph');

    // Capitalize each word
    latin = latin
        .split(' ')
        .filter(Boolean)
        .map(word => {
            return word.charAt(0).toUpperCase() +
                   word.slice(1).toLowerCase();
        })
        .join(' ');

    return latin;
}
