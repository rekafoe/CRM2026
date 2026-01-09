import React from 'react';

/**
 * Skeleton loader для таблицы tiers
 */
export const TiersTableSkeleton: React.FC = () => {
  return (
    <div className="overflow-hidden border border-gray-200 rounded-lg animate-pulse">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-white">
          <tr>
            <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Мин. количество
            </th>
            <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Цена за единицу
            </th>
            <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
            <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">
              Действия
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {[1, 2, 3].map((i) => (
            <tr key={i}>
              <td className="px-4 py-2">
                <div className="h-4 bg-gray-200 rounded w-20"></div>
              </td>
              <td className="px-4 py-2">
                <div className="h-4 bg-gray-200 rounded w-24"></div>
              </td>
              <td className="px-4 py-2">
                <div className="h-6 bg-gray-200 rounded w-16"></div>
              </td>
              <td className="px-4 py-2 text-right">
                <div className="flex gap-2 justify-end">
                  <div className="h-8 bg-gray-200 rounded w-8"></div>
                  <div className="h-8 bg-gray-200 rounded w-8"></div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
