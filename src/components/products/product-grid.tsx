import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnOrderState,
  type ColumnSizingState,
  type ColumnSizingInfoState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical, ImageOff } from "lucide-react";
import { useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { columnLabel, formatGridValue, PRODUCT_COLUMNS, type ProductRow } from "@/lib/product-grid";
import { cn } from "@/lib/utils";

export function ProductGrid({
  products,
  archives,
  isAdmin,
  selectedIds,
  visibility,
  order,
  sizing,
  sorting,
  onSelectionChange,
  onVisibilityChange,
  onOrderChange,
  onSizingChange,
  onSortingChange,
  onOpen,
  imageUrls,
  listName,
}: {
  products: ProductRow[];
  archives: Map<string, string>;
  isAdmin: boolean;
  selectedIds: Set<string>;
  visibility: VisibilityState;
  order: ColumnOrderState;
  sizing: ColumnSizingState;
  sorting: SortingState;
  onSelectionChange: (ids: Set<string>) => void;
  onVisibilityChange: (state: VisibilityState) => void;
  onOrderChange: (state: ColumnOrderState) => void;
  onSizingChange: (state: ColumnSizingState) => void;
  onSortingChange: (state: SortingState) => void;
  onOpen: (product: ProductRow) => void;
  imageUrls: Map<string, string>;
  listName?: (number: number) => string;
}) {
  const [sizingInfo, setSizingInfo] = useState<ColumnSizingInfoState>({
    startOffset: null,
    startSize: null,
    deltaOffset: null,
    deltaPercentage: null,
    isResizingColumn: false,
    columnSizingStart: [],
  });
  const columns = useMemo<ColumnDef<ProductRow>[]>(() => [
    {
      id: "select",
      size: 40,
      minSize: 40,
      enableSorting: false,
      enableResizing: false,
      header: () => {
        const pageIds = products.map((product) => product.id);
        const selectedOnPage = pageIds.filter((id) => selectedIds.has(id)).length;
        return (
          <Checkbox
            checked={selectedOnPage === pageIds.length && pageIds.length > 0 ? true : selectedOnPage > 0 ? "indeterminate" : false}
            onCheckedChange={(value) => {
              const next = new Set(selectedIds);
              for (const id of pageIds) value === true ? next.add(id) : next.delete(id);
              onSelectionChange(next);
            }}
            aria-label="Seleziona la pagina corrente"
          />
        );
      },
      cell: ({ row }) => (
        <Checkbox
          checked={selectedIds.has(row.original.id)}
          onCheckedChange={(value) => {
            const next = new Set(selectedIds);
            if (value === true) next.add(row.original.id); else next.delete(row.original.id);
            onSelectionChange(next);
          }}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Seleziona ${row.original.code}`}
        />
      ),
    },
    ...PRODUCT_COLUMNS.filter((item) => isAdmin || !item.adminOnly).map((item): ColumnDef<ProductRow> => ({
      id: item.id,
      accessorFn: (row) => item.value(row, archives),
      header: columnLabel(item, listName),
      size: item.size,
      minSize: item.minSize,
      sortingFn: item.numeric ? "basic" : "alphanumeric",
      cell: (context) => item.id === "image" ? (
        imageUrls.get(context.row.original.id) ? <img src={imageUrls.get(context.row.original.id)} alt="" loading="lazy" className="mx-auto h-7 w-10 object-contain" /> : <ImageOff className="mx-auto h-4 w-4 text-muted-foreground" aria-label="Senza immagine" />
      ) : (
        <span className={cn("block truncate", item.id === "code" && "font-mono text-xs font-semibold", item.numeric && "text-right tabular-nums")}>
          {formatGridValue(item, context.getValue<string | number | null>())}
        </span>
      ),
    })),
  ], [archives, imageUrls, isAdmin, listName, onSelectionChange, selectedIds]);

  const table = useReactTable({
    data: products,
    columns,
    state: { columnVisibility: visibility, columnOrder: ["select", ...order.filter((id) => id !== "select")], columnSizing: sizing, columnSizingInfo: sizingInfo, sorting },
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    onColumnVisibilityChange: (updater) => onVisibilityChange(typeof updater === "function" ? updater(visibility) : updater),
    onColumnOrderChange: (updater) => onOrderChange((typeof updater === "function" ? updater(order) : updater).filter((id) => id !== "select")),
    onColumnSizingChange: (updater) => onSizingChange(typeof updater === "function" ? updater(sizing) : updater),
    onColumnSizingInfoChange: setSizingInfo,
    onSortingChange: (updater) => onSortingChange(typeof updater === "function" ? updater(sorting) : updater),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  function startDrag(event: React.DragEvent, id: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }

  function dropColumn(event: React.DragEvent, targetId: string) {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === targetId || sourceId === "select" || targetId === "select") return;
    const next = [...order];
    const from = next.indexOf(sourceId);
    const to = next.indexOf(targetId);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, sourceId);
    onOrderChange(next);
  }

  return (
    <div className="hidden h-[calc(100vh-235px)] min-h-[360px] overflow-auto border border-border bg-card md:block">
      <table className="border-separate border-spacing-0 text-xs" style={{ width: table.getTotalSize() }}>
        <thead className="sticky top-0 z-10 bg-muted">
          {table.getHeaderGroups().map((group) => <tr key={group.id}>
            {group.headers.map((header) => {
              const sorted = header.column.getIsSorted();
              return <th key={header.id} style={{ width: header.getSize() }} className="relative h-9 border-b border-r border-border px-2 text-left font-semibold last:border-r-0">
                {header.column.id === "select" ? flexRender(header.column.columnDef.header, header.getContext()) : <button
                  type="button"
                  draggable
                  onDragStart={(event) => startDrag(event, header.column.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => dropColumn(event, header.column.id)}
                  onClick={header.column.getToggleSortingHandler()}
                  className="flex h-full w-full min-w-0 items-center gap-1 text-left"
                >
                  <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                  {sorted === "asc" ? <ArrowUp className="ml-auto h-3 w-3 shrink-0" /> : sorted === "desc" ? <ArrowDown className="ml-auto h-3 w-3 shrink-0" /> : <ArrowUpDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />}
                </button>}
                {header.column.getCanResize() ? <div
                  onMouseDown={header.getResizeHandler()}
                  onTouchStart={header.getResizeHandler()}
                  className={cn("absolute inset-y-0 right-0 w-1 cursor-col-resize touch-none bg-transparent hover:bg-accent", header.column.getIsResizing() && "bg-accent")}
                /> : null}
              </th>;
            })}
          </tr>)}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => <tr key={row.id} onClick={() => onOpen(row.original)} className={cn("h-8 cursor-pointer hover:bg-muted/60", selectedIds.has(row.original.id) && "bg-accent/10")}>
            {row.getVisibleCells().map((cell) => <td key={cell.id} style={{ width: cell.column.getSize(), maxWidth: cell.column.getSize() }} className="border-b border-r border-border px-2 py-1 last:border-r-0">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
          </tr>)}
        </tbody>
      </table>
      {!products.length ? <div className="grid h-48 place-items-center text-sm text-muted-foreground">Nessun prodotto corrisponde ai filtri.</div> : null}
    </div>
  );
}