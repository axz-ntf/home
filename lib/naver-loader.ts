let loadPromise: Promise<void> | null = null;

export function loadNaverMaps(clientId: string): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Naver Maps must be loaded on the client"));
      return;
    }

    const w = window as unknown as { naver?: { maps?: unknown } };

    if (w.naver?.maps) {
      resolve();
      return;
    }

    const existing = document.getElementById("naver-maps-sdk") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Naver Maps SDK 로드 실패")));
      return;
    }

    const script = document.createElement("script");
    script.id = "naver-maps-sdk";
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&submodules=panorama`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Naver Maps SDK 로드 실패"));
    document.head.appendChild(script);
  });

  return loadPromise;
}
