export type GraphCamera = { x: number; y: number; zoom: number };
export type GraphTouch = { x: number; y: number; distance: number; count: number };

export function moveGraphCamera(
  camera: GraphCamera,
  previous: GraphTouch,
  next: GraphTouch,
  viewport: { width: number; height: number; x: number; y: number },
  span: { width: number; height: number },
): GraphCamera {
  "worklet";
  if (previous.count !== next.count || !viewport.width || !viewport.height) return camera;
  const zoom = Math.min(
    12,
    Math.max(
      1,
      camera.zoom *
        (previous.count > 1 && previous.distance > 0 ? next.distance / previous.distance : 1),
    ),
  );
  const baseScale = Math.max(span.width / viewport.width, span.height / viewport.height);
  const oldScale = baseScale / camera.zoom;
  const newScale = baseScale / zoom;
  const centerX = viewport.x + viewport.width / 2;
  const centerY = viewport.y + viewport.height / 2;
  return {
    zoom,
    x: camera.x + (previous.x - centerX) * oldScale - (next.x - centerX) * newScale,
    y: camera.y + (previous.y - centerY) * oldScale - (next.y - centerY) * newScale,
  };
}

export function graphDrawingMatrix(camera: GraphCamera, center: { x: number; y: number }) {
  "worklet";
  return [
    camera.zoom,
    0,
    0,
    camera.zoom,
    center.x - camera.x * camera.zoom,
    center.y - camera.y * camera.zoom,
  ];
}
