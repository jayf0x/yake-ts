/**
 * Directed co-occurrence graph: which terms appear near which other terms,
 * and how often. Plain data + functions — nothing here needs multiple
 * instances or inheritance, so a class would just be ceremony around two Maps.
 */
export interface CooccurrenceGraph {
  readonly outgoing: Map<number, Map<number, number>>;
  readonly incoming: Map<number, Map<number, number>>;
}

export function createGraph(): CooccurrenceGraph {
  return { outgoing: new Map(), incoming: new Map() };
}

export function addNode(graph: CooccurrenceGraph, id: number): void {
  if (!graph.outgoing.has(id)) {
    graph.outgoing.set(id, new Map());
  }

  if (!graph.incoming.has(id)) {
    graph.incoming.set(id, new Map());
  }
}

export function hasEdge(graph: CooccurrenceGraph, source: number, target: number): boolean {
  return graph.outgoing.get(source)?.has(target) ?? false;
}

export function incrementEdge(graph: CooccurrenceGraph, source: number, target: number, delta = 1): void {
  addNode(graph, source);
  addNode(graph, target);

  const outgoingEdges = graph.outgoing.get(source)!;
  const incomingEdges = graph.incoming.get(target)!;
  const nextWeight = (outgoingEdges.get(target) ?? 0) + delta;

  outgoingEdges.set(target, nextWeight);
  incomingEdges.set(source, nextWeight);
}

export function getWeight(graph: CooccurrenceGraph, source: number, target: number): number {
  return graph.outgoing.get(source)?.get(target) ?? 0;
}

export function outDegree(graph: CooccurrenceGraph, id: number): number {
  return graph.outgoing.get(id)?.size ?? 0;
}

export function inDegree(graph: CooccurrenceGraph, id: number): number {
  return graph.incoming.get(id)?.size ?? 0;
}

export function outWeightSum(graph: CooccurrenceGraph, id: number): number {
  return sum(graph.outgoing.get(id)?.values());
}

export function inWeightSum(graph: CooccurrenceGraph, id: number): number {
  return sum(graph.incoming.get(id)?.values());
}

function sum(values: Iterable<number> | undefined): number {
  let total = 0;
  for (const value of values ?? []) {
    total += value;
  }
  return total;
}
