import React from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import StockItem from './StockItem';
import { useStockContext } from '../context/StockContext';

const StockList = () => {
  const { stocks, reorderStocks } = useStockContext();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) {
      const oldIndex = stocks.findIndex(s => s.symbol === active.id);
      const newIndex = stocks.findIndex(s => s.symbol === over.id);
      reorderStocks(arrayMove(stocks, oldIndex, newIndex));
    }
  };

  if (stocks.length === 0) return null;

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stocks.map(s => s.symbol)} strategy={verticalListSortingStrategy}>
          {stocks.map((stock, index) => (
            <StockItem key={stock.symbol} stock={stock} index={index} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default StockList;
