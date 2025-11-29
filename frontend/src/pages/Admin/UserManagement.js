import React, { useState, useEffect } from 'react';
import { getUsers, createUser, updateUser, deleteUser } from '../../services/api';
import './UserManagement.css';

const ROLES = {
  super_admin: 'Super Admin',
  user_admin: 'User Admin',
  service_account: 'Service Account',
  regular_user: 'Regular User',
};

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [apiKeyInfo, setApiKeyInfo] = useState(null);

  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role: 'regular_user',
    isActive: true,
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);

    try {
      // Backend uses tenantContext from JWT - no need to pass orgId
      const response = await getUsers();
      console.log('Users loaded:', response); // Debug log
      setUsers(response.users || []);
    } catch (err) {
      setError(`Failed to load users: ${err.message}`);
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      if (editingUser) {
        // Update existing user (backend uses tenantContext)
        await updateUser(editingUser.id, formData);
      } else {
        // Create new user (backend uses tenantContext)
        const response = await createUser(formData);

        // Show API key if service account was created
        if (response.user?.apiKey) {
          setApiKeyInfo({
            email: response.user.email,
            apiKey: response.user.apiKey,
            note: response.user.apiKeyNote,
          });
        }
      }

      // Reset form and reload users
      setFormData({
        email: '',
        name: '',
        role: 'regular_user',
        isActive: true,
      });
      setEditingUser(null);
      setShowModal(false);
      await loadUsers();

    } catch (err) {
      setError(`Failed to ${editingUser ? 'update' : 'create'} user: ${err.message}`);
      console.error('Error saving user:', err);
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.is_active,
    });
    setShowModal(true);
    setApiKeyInfo(null);
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }

    setError(null);

    try {
      await deleteUser(userId);
      await loadUsers();
    } catch (err) {
      setError(`Failed to delete user: ${err.message}`);
      console.error('Error deleting user:', err);
    }
  };

  const handleAddNew = () => {
    setEditingUser(null);
    setFormData({
      email: '',
      name: '',
      role: 'regular_user',
      isActive: true,
    });
    setShowModal(true);
    setApiKeyInfo(null);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setApiKeyInfo(null);
    setFormData({
      email: '',
      name: '',
      role: 'regular_user',
      isActive: true,
    });
  };

  const closeApiKeyModal = () => {
    setApiKeyInfo(null);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('API key copied to clipboard!');
  };

  if (loading) {
    return (
      <div className="user-management">
        <h1>User Management</h1>
        <div className="loading">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="user-management">
      <div className="header">
        <div>
          <h1>User Management</h1>
          <p className="subtitle">Manage admin users and assign roles</p>
        </div>
        <button className="btn btn-primary" onClick={handleAddNew}>
          + Add User
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty-state">
                  No users found. Click "Add User" to create one.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`role-badge role-${user.role}`}>
                      {ROLES[user.role] || user.role}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${user.is_active ? 'active' : 'inactive'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{new Date(user.created_at).toLocaleDateString()}</td>
                  <td className="actions">
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => handleEdit(user)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => handleDelete(user.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* User Form Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingUser ? 'Edit User' : 'Add New User'}</h2>
              <button className="close-btn" onClick={closeModal}>&times;</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="name">Name *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  placeholder="John Doe"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email *</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  disabled={editingUser !== null}
                  placeholder="john@example.com"
                />
                {editingUser && (
                  <small className="form-hint">Email cannot be changed</small>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="role">Role *</label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  required
                >
                  {Object.entries(ROLES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <small className="form-hint">
                  {formData.role === 'super_admin' && 'Full administrative access to all features'}
                  {formData.role === 'user_admin' && 'Can manage users and view reports'}
                  {formData.role === 'service_account' && 'Automated service access (API key will be generated)'}
                  {formData.role === 'regular_user' && 'Standard user with limited access'}
                </small>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                  />
                  <span>Active</span>
                </label>
                <small className="form-hint">Inactive users cannot log in</small>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingUser ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* API Key Display Modal */}
      {apiKeyInfo && (
        <div className="modal-overlay" onClick={closeApiKeyModal}>
          <div className="modal modal-small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Service Account Created</h2>
              <button className="close-btn" onClick={closeApiKeyModal}>&times;</button>
            </div>

            <div className="api-key-info">
              <div className="alert alert-warning">
                <strong>⚠️ Important:</strong> Save this API key securely. It will not be shown again.
              </div>

              <div className="form-group">
                <label>Account Email</label>
                <input
                  type="text"
                  value={apiKeyInfo.email}
                  readOnly
                />
              </div>

              <div className="form-group">
                <label>API Key</label>
                <div className="api-key-display">
                  <input
                    type="text"
                    value={apiKeyInfo.apiKey}
                    readOnly
                    className="api-key-input"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => copyToClipboard(apiKeyInfo.apiKey)}
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={closeApiKeyModal}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagement;
