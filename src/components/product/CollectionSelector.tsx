import type { useProductSelections } from '../../api/useProductSelections'

type Selection = ReturnType<typeof useProductSelections>
export function CollectionSelector({ selection, label }: { selection: Selection; label: string }) {
  if (!selection.collections.length) return null
  return <label>{label}{' '}<select aria-label={label} value={selection.collectionId ?? ''}
    disabled={selection.pending} onChange={(event) => selection.selectCollection(event.target.value)}>
    {selection.collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
  </select></label>
}
