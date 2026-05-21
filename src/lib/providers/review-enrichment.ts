export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    return await new Promise((resolve) => {
        const t = setTimeout(() => resolve(null), ms);
        promise
            .then((v) => {
                clearTimeout(t);
                resolve(v);
            })
            .catch(() => {
                clearTimeout(t);
                resolve(null);
            });
    });
}
