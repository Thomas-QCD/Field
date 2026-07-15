import { Plus } from 'lucide-react';
import { mockTasks } from '../data/mockTasks';

export function TasksPage() {
  const handleNewTask = () => {
    console.log('New Task — coming soon');
  };

  return (
    <div className="tasks-page">
      <div className="tasks-header">
        <h1>Tasks</h1>
        <button type="button" className="btn-new-task" onClick={handleNewTask}>
          <Plus size={18} aria-hidden />
          New Task
        </button>
      </div>
      <div className="tasks-grid-wrap">
        <table className="tasks-grid">
          <thead>
            <tr>
              <th scope="col">Key</th>
              <th scope="col">Type</th>
              <th scope="col">Status</th>
              <th scope="col">Recipient</th>
              <th scope="col">Destination</th>
              <th scope="col">Driver</th>
            </tr>
          </thead>
          <tbody>
            {mockTasks.map((task) => (
              <tr key={task.id} tabIndex={0}>
                <td className="task-key">#{task.externalKey}</td>
                <td>{task.taskType}</td>
                <td>
                  <span className="task-status" data-status={task.status}>
                    {task.status}
                  </span>
                </td>
                <td>{task.recipientName}</td>
                <td className="task-address">{task.destinationAddress}</td>
                <td>{task.driverName ?? 'Unassigned'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
