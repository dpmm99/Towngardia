export function inPlaceShuffle<T>(array: T[]): T[] { //Fisher-Yates
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const a = array[i];
        array[i] = array[j];
        array[j] = a;
    }
    return array;
}