/**
 * Directed co-occurrence graph: which terms appear near which other terms,
 * and how often. Plain data + functions — nothing here needs multiple
 * instances or inheritance, so a class would just be ceremony around two Maps.
 */
export interface CooccurrenceGraph {
  readonly outgoing: Map<number, Map<number, number>>;
  readonly incoming: Map<number, Map<number, number>>;
}

export const createGraph = (): CooccurrenceGraph => ({ outgoing: new Map(), incoming: new Map() });

export const addNode = (graph: CooccurrenceGraph, id: number): void => {
  if (!graph.outgoing.has(id)) graph.outgoing.set(id, new Map());
  if (!graph.incoming.has(id)) graph.incoming.set(id, new Map());
};

export const hasEdge = (graph: CooccurrenceGraph, source: number, target: number): boolean =>
  graph.outgoing.get(source)?.has(target) ?? false;

export const incrementEdge = (graph: CooccurrenceGraph, source: number, target: number, delta = 1): void => {
  addNode(graph, source);
  addNode(graph, target);

  const outgoingEdges = graph.outgoing.get(source)!;
  const incomingEdges = graph.incoming.get(target)!;
  const nextWeight = (outgoingEdges.get(target) ?? 0) + delta;

  outgoingEdges.set(target, nextWeight);
  incomingEdges.set(source, nextWeight);
};

export const getWeight = (graph: CooccurrenceGraph, source: number, target: number): number =>
  graph.outgoing.get(source)?.get(target) ?? 0;

export const outDegree = (graph: CooccurrenceGraph, id: number): number => graph.outgoing.get(id)?.size ?? 0;

export const inDegree = (graph: CooccurrenceGraph, id: number): number => graph.incoming.get(id)?.size ?? 0;

export const outWeightSum = (graph: CooccurrenceGraph, id: number): number => sum(graph.outgoing.get(id)?.values());

export const inWeightSum = (graph: CooccurrenceGraph, id: number): number => sum(graph.incoming.get(id)?.values());

const sum = (values: Iterable<number> | undefined): number => {
  let total = 0;
  for (const value of values ?? []) total += value;
  return total;
};
