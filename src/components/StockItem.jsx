import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStockContext } from '../context/StockContext';

const StockItem = ({ stock, index }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stock.symbol });
  const navigate = useNavigate();
  const { removeStock } = useStockContext();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`stock-item ${isDragging ? 'dragging' : ''}`}
    >
      {/* 左側：拖曳 + 排名 + 股票資訊 */}
      <div className="flex-row" style={{ gap: '0.85rem', flex: 1, minWidth: 0 }}>
        <div
          {...attributes}
          {...listeners}
          style={{ cursor: 'grab', color: 'var(--text-muted)', flexShrink: 0, display: 'flex', alignItems: 'center' }}
          title="拖曳排序"
        >
          <GripVertical size={18} />
        </div>

        <div className="stock-item__rank">{index + 1}</div>

        <div
          style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
          onClick={() => navigate(`/stock/${stock.symbol}`)}
        >
          <div className="flex-row" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
            <span className="stock-item__symbol">{stock.symbol}</span>
            <span className="stock-item__name">{stock.name}</span>
          </div>
        </div>
      </div>

      {/* 右側：操作按鈕 */}
      <div className="flex-row" style={{ gap: '0.25rem', flexShrink: 0 }}>
        <button
          className="btn-icon btn-danger"
          onClick={(e) => { e.stopPropagation(); removeStock(stock.symbol); }}
          title="刪除"
        >
          <Trash2 size={16} />
        </button>
        <button
          className="btn-icon"
          onClick={() => navigate(`/stock/${stock.symbol}`)}
          title="查看詳情"
          style={{ color: 'var(--accent)' }}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default StockItem;
