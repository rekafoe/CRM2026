export interface Item {
  id: number;
  orderId: number;
  type: string;
  params: { description: string; components?: Array<{ materialId: number; qtyPerItem: number }> };
  price: number;
  quantity: number;
  printerId?: number;
  sides?: number; // 1 or 2
  sheets?: number; // SRA3 sheets printed
  waste?: number;  // defective sheets
  clicks?: number; // computed clicks for printers
  /** Исполнитель — оператор, выполняющий эту позицию */
  executor_user_id?: number | null;
}
