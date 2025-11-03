import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { t } from 'ttag';
import { FaFlag, FaUsers, FaEdit, FaTrash, FaUserPlus, FaUserMinus, FaPlus, FaUpload } from 'react-icons/fa';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const Factions = () => {
  const [factions, setFactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFaction, setSelectedFaction] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    flag: null,
    welcomeTemplate: '',
    themeColor: '#ffffff',
    tag: ''
  });
  const [flagPreview, setFlagPreview] = useState(null);
  const [sortBy, setSortBy] = useState('pixels');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedFactions, setExpandedFactions] = useState(new Set());
  const [expandedMembers, setExpandedMembers] = useState(new Set());
  const [chartData, setChartData] = useState({
    dailyPixels: {
      labels: [],
      datasets: []
    },
    totalPixels: {
      labels: [],
      datasets: []
    },
    memberDistribution: {
      labels: [],
      datasets: []
    }
  });
  const [historicalData, setHistoricalData] = useState({
    timestamps: [],
    dailyPixels: {},
    totalPixels: {}
  });

  const auth = useSelector((state) => state?.auth || {});
  const ranks = useSelector((state) => state?.ranks || {});
  const user = useSelector((state) => state?.user || {});
  const totalPixels = ranks?.totalPixels || 0;

  // Get canvases from Redux store with default empty object
  const canvases = useSelector((state) => state.canvas?.canvases || {});
  const canvasDescriptions = useSelector((state) => state.canvas?.canvasDescriptions || {});

  // Check if user is already in a faction
  const isInFaction = factions.some(faction =>
    faction.members.some(member => member.id === user?.id)
  );

  // Check if user owns a faction
  const ownsFaction = factions.some(faction => faction.owner.id === user?.id);

  // Simplified condition for creating faction
  const canCreateFaction = user?.id && totalPixels >= 200000 && !isInFaction;

  // Function to update chart data
  const updateChartData = (factions) => {
    const topFactions = [...factions]
      .sort((a, b) => b.dailyPixels - a.dailyPixels)
      .slice(0, 5);

    const currentTime = new Date().toLocaleTimeString();

    // Update historical data
    setHistoricalData(prev => {
      const newTimestamps = [...prev.timestamps, currentTime].slice(-10); // Keep last 10 data points
      const newDailyPixels = { ...prev.dailyPixels };
      const newTotalPixels = { ...prev.totalPixels };

      topFactions.forEach(faction => {
        if (!newDailyPixels[faction.name]) {
          newDailyPixels[faction.name] = [];
        }
        if (!newTotalPixels[faction.name]) {
          newTotalPixels[faction.name] = [];
        }
        newDailyPixels[faction.name] = [...newDailyPixels[faction.name], faction.dailyPixels].slice(-10);
        newTotalPixels[faction.name] = [...newTotalPixels[faction.name], faction.totalPixels].slice(-10);
      });

      return {
        timestamps: newTimestamps,
        dailyPixels: newDailyPixels,
        totalPixels: newTotalPixels
      };
    });

    // Generate colors for each faction
    const colors = [
      'rgb(255, 99, 132)',
      'rgb(54, 162, 235)',
      'rgb(255, 206, 86)',
      'rgb(75, 192, 192)',
      'rgb(153, 102, 255)'
    ];

    // Daily Pixels Line Chart
    const dailyPixelsData = {
      labels: historicalData.timestamps,
      datasets: topFactions.map((faction, index) => ({
        label: faction.name,
        data: historicalData.dailyPixels[faction.name] || [],
        borderColor: colors[index],
        tension: 0.1,
        fill: false
      }))
    };

    // Total Pixels Line Chart
    const totalPixelsData = {
      labels: historicalData.timestamps,
      datasets: topFactions.map((faction, index) => ({
        label: faction.name,
        data: historicalData.totalPixels[faction.name] || [],
        borderColor: colors[index],
        tension: 0.1,
        fill: false
      }))
    };

    // Member Distribution Doughnut Chart
    const memberDistributionData = {
      labels: topFactions.map(f => f.name),
      datasets: [{
        data: topFactions.map(f => f.members.length),
        backgroundColor: colors.map(color => color.replace('rgb', 'rgba').replace(')', ', 0.6)')),
        borderColor: colors,
        borderWidth: 1,
      }]
    };

    setChartData({
      dailyPixels: dailyPixelsData,
      totalPixels: totalPixelsData,
      memberDistribution: memberDistributionData
    });
  };

  const fetchFactions = async () => {
    try {
      const response = await fetch('/api/faction/list');
      const data = await response.json();
      if (!data.success) {
        setError(data.error || t`Failed to fetch factions`);
      } else {
        setFactions(data.factions);
        updateChartData(data.factions);
      }
    } catch (err) {
      setError(t`Failed to fetch factions`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFactions();
    // Set up interval to refresh factions every 5 minutes
    const interval = setInterval(fetchFactions, 300000);
    return () => clearInterval(interval);
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (10MB = 10 * 1024 * 1024 bytes)
    if (file.size > 10 * 1024 * 1024) {
      setError(t`File size must be less than 10MB`);
      return;
    }

    // Check if file is an image
    if (!file.type.startsWith('image/')) {
      setError(t`Please upload an image file`);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setFlagPreview(reader.result);
      setFormData({ ...formData, flag: reader.result });
    };
    reader.onerror = () => {
      setError(t`Failed to read file`);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateFaction = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/faction/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setShowCreateModal(false);
        setFormData({ name: '', description: '', flag: null, tag: '' });
        setFlagPreview(null);
        fetchFactions();
      }
    } catch (err) {
      setError(t`Failed to create faction`);
    }
  };

  const handleJoinFaction = async (factionId) => {
    try {
      const response = await fetch('/api/faction/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ factionId }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        fetchFactions();
      }
    } catch (err) {
      setError(t`Failed to join faction`);
    }
  };

  const handleLeaveFaction = async (factionId) => {
    try {
      const response = await fetch('/api/faction/leave', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ factionId }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        fetchFactions();
      }
    } catch (err) {
      setError(t`Failed to leave faction`);
    }
  };

  const handleUpdateFaction = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/faction/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          factionId: selectedFaction.id,
          ...formData,
        }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setShowEditModal(false);
        setFormData({ name: '', description: '', flag: null });
        fetchFactions();
      }
    } catch (err) {
      setError(t`Failed to update faction`);
    }
  };

  const handleDeleteFaction = async (factionId) => {
    if (!window.confirm(t`Are you sure you want to delete this faction?`)) {
      return;
    }
    try {
      const response = await fetch('/api/faction/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ factionId }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        fetchFactions();
      }
    } catch (err) {
      setError(t`Failed to delete faction`);
    }
  };

  const handleKickMember = async (factionId, userId) => {
    if (!window.confirm(t`Are you sure you want to kick this member?`)) {
      return;
    }
    try {
      const response = await fetch('/api/faction/kick', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ factionId, userId }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        fetchFactions();
      }
    } catch (err) {
      setError(t`Failed to kick member`);
    }
  };

  const handleTransferOwnership = async () => {
    try {
      const response = await fetch('/api/faction/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          factionId: selectedMember.factionId,
          newOwnerId: selectedMember.id
        }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setShowTransferModal(false);
        setSelectedMember(null);
        fetchFactions();
      }
    } catch (err) {
      setError(t`Failed to transfer ownership`);
    }
  };

  const handleUpdateWelcomeTemplate = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/faction/welcome/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          factionId: selectedFaction.id,
          welcomeTemplate: formData.welcomeTemplate,
        }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setShowEditModal(false);
        fetchFactions();
      }
    } catch (err) {
      setError(t`Failed to update welcome template`);
    }
  };

  const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const calculateFactionPixels = (members) => {
    return members.reduce((total, member) => total + (member.totalPixels || 0), 0);
  };

  const calculateFactionDailyPixels = (members) => {
    return members.reduce((total, member) => total + (member.dailyPixels || 0), 0);
  };

  const sortFactions = (factions) => {
    switch (sortBy) {
      case 'pixels':
        return [...factions].sort((a, b) => calculateFactionPixels(b.members) - calculateFactionPixels(a.members));
      case 'dailyPixels':
        return [...factions].sort((a, b) => calculateFactionDailyPixels(b.members) - calculateFactionDailyPixels(a.members));
      case 'members':
        return [...factions].sort((a, b) => b.members.length - a.members.length);
      default:
        return factions;
    }
  };

  const toggleMemberList = (factionId) => {
    setExpandedFactions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(factionId)) {
        newSet.delete(factionId);
      } else {
        newSet.add(factionId);
      }
      return newSet;
    });
  };

  const toggleMemberDetails = (memberId) => {
    setExpandedMembers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        newSet.add(memberId);
      }
      return newSet;
    });
  };

  const renderFactionCard = (faction) => {
    const isOwner = faction.owner.id === user?.id;
    const isMember = faction.members.some(member => member.id === user?.id);
    const memberRank = faction.members.find(member => member.id === user?.id)?.rank || 0;
    const isExpanded = expandedFactions.has(faction.id);

    return (
      <div
        className="faction-card"
        key={faction.id}
        style={{
          borderColor: faction.themeColor || '#ffffff',
          color: faction.themeColor || '#ffffff'
        }}
      >
        <div className="faction-header">
          <h3>{faction.name}</h3>
          {faction.flag && <img src={`/factions/flags/${faction.flag}`} alt={faction.name} />}
        </div>
        <div className="faction-info">
          <p>{faction.description}</p>
          <div className="faction-stats">
            <div>Total Pixels: {formatNumber(faction.totalPixels)}</div>
            <div>Daily Pixels: {formatNumber(faction.dailyPixels)}</div>
            <div>Members: {faction.members.length}</div>
            <div>Rank: #{faction.rank}</div>
          </div>
          {isMember && (
            <div className="member-info">
              <div>Your Rank: #{memberRank}</div>
              <div>Your Daily Pixels: {formatNumber(faction.members.find(m => m.id === user?.id)?.dailyPixels || 0)}</div>
            </div>
          )}
        </div>

        <div className="faction-members">
          <button
            className="toggle-members-btn"
            onClick={() => toggleMemberList(faction.id)}
          >
            <FaUsers /> {isExpanded ? t`Hide Members` : t`Show Members`}
          </button>

          {isExpanded && (
            <div className="members-list">
              <div className="member-row header">
                <span>{t`Rank`}</span>
                <span>{t`Name`}</span>
                <span>{t`Role`}</span>
                <span>{t`Daily Pixels`}</span>
                <span>{t`Total Pixels`}</span>
              </div>
              {faction.members
                .sort((a, b) => (a.rank || 0) - (b.rank || 0))
                .map((member) => {
                  const isExpanded = expandedMembers.has(member.id);
                  return (
                    <div
                      key={member.id}
                      className={`member-row ${isExpanded ? 'expanded' : ''}`}
                      onClick={() => toggleMemberDetails(member.id)}
                    >
                      <div className="member-basic">
                        <span className="member-rank">#{member.rank || '-'}</span>
                        <span className="member-name">{['Private account', 'Private Account'].includes(member.name) ? t`Private Account` : member.name}</span>
                        <span className="member-role">{member.role}</span>
                      </div>
                      {isExpanded && (
                        <div className="member-details">
                          <div className="detail-row">
                            <span className="detail-label">{t`Daily Pixels`}</span>
                            <span className="detail-value">{formatNumber(member.dailyPixels || 0)}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">{t`Total Pixels`}</span>
                            <span className="detail-value">{formatNumber(member.totalPixels || 0)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        <div className="faction-actions">
          {!!user?.id && !isMember && !isInFaction && (
            <button onClick={() => handleJoinFaction(faction.id)}>
              <FaUserPlus /> {t`Join`}
            </button>
          )}
          {isMember && !isOwner && (
            <button onClick={() => handleLeaveFaction(faction.id)}>
              <FaUserMinus /> {t`Leave`}
            </button>
          )}
          {isOwner && (
            <>
              <button onClick={() => { setSelectedFaction(faction); setShowEditModal(true); }}>
                <FaEdit /> {t`Edit`}
              </button>
              <button onClick={() => handleDeleteFaction(faction.id)}>
                <FaTrash /> {t`Delete`}
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  // Chart options
  const lineChartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        color: 'rgba(255, 255, 255, 0.8)',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.8)',
        },
      },
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.8)',
          maxRotation: 45,
          minRotation: 45,
          callback: function (value, index, values) {
            if (typeof value === 'string') {
              return value.split(' ').join('\n');
            }
            return value;
          }
        },
      },
    },
  };

  const doughnutChartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: 'rgba(255, 255, 255, 0.8)',
        },
      },
      title: {
        display: true,
        color: 'rgba(255, 255, 255, 0.8)',
      },
    },
  };

  if (loading) {
    return (
      <div className="factions-container">
        <div className="loading">{t`Loading factions...`}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="factions-container">
        <div className="error">{error}</div>
      </div>
    );
  }

  return (

    <div className="factions-container">
      <div className="factions-header">
        <h2>{t`Factions`}</h2>
        <div className="factions-actions">
          <input
            type="text"
            placeholder={t`Search factions...`}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="faction-search-input"
            style={{
              padding: '0.25rem 0.5rem',
              marginRight: '1rem',
              borderRadius: '4px',
              border: '1px solid #ccc'
            }}
          />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="pixels">{t`Sort by Total Pixels`}</option>
            <option value="dailyPixels">{t`Sort by Daily Pixels`}</option>
            <option value="members">{t`Sort by Members`}</option>
          </select>
          {!!canCreateFaction && (
            <button onClick={() => setShowCreateModal(true)}>
              <FaPlus /> {t`Create Faction`}
            </button>
          )}
        </div>
      </div>

      {showEditModal && (
        <div className="faction.modal">
          <div className="faction.modal-content">
            <h3>{t`Edit Faction`}</h3>
            <form onSubmit={handleUpdateFaction}>
              <div>
                <label>{t`Name `}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                  placeholder={t`Enter faction name`}
                />
              </div>
              <div>
                <label>{t`Description `}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder={t`Enter faction description`}
                />
              </div>
              <div>
                <label>{t`Faction Tag (2-4 characters)`}</label>
                <input
                  type="text"
                  value={formData.tag}
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    if (value.length <= 4) {
                      setFormData({ ...formData, tag: value });
                    }
                  }}
                  maxLength="4"
                  minLength="2"
                  placeholder={t`Enter faction tag (e.g., ABC1)`}
                  style={{ textTransform: 'uppercase' }}
                />
                <small>{t`Alphanumeric characters only, 2-4 characters. This will appear in chat as [TAG] before member names.`}</small>
              </div>
              <div>
                <label>{t`Faction Flag`}</label>
                <div className="file-upload">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                  {flagPreview ? (
                    <div className="preview-container">
                      <img
                        src={flagPreview}
                        alt={t`Flag preview`}
                        className="preview-image"
                      />
                      <button
                        type="button"
                        className="remove-image-btn"
                        onClick={() => {
                          setFlagPreview(null);
                          setFormData({ ...formData, flag: null });
                        }}
                      >
                        {t`Remove Image`}
                      </button>
                    </div>
                  ) : (
                    <>
                      <FaUpload className="file-upload-icon" />
                      <div className="file-upload-text">
                        {t`Click or drag an image to upload`}
                        <div className="file-upload-info">
                          {t`Max size: 10MB`}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="faction.modal-actions">
                <button type="submit">{t`Update Faction`}</button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setFlagPreview(null);
                  }}
                >
                  {t`Cancel`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="faction.modal">
          <div className="faction.modal-content">
            <h3>{t`Create Faction`}</h3>
            <form onSubmit={handleCreateFaction}>
              <div>
                <label>{t`Name `}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                  placeholder={t`Enter faction name`}
                />
              </div>
              <div>
                <label>{t`Description `}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder={t`Enter faction description`}
                />
              </div>
              <div>
                <label>{t`Faction Tag (2-4 characters)`}</label>
                <input
                  type="text"
                  value={formData.tag}
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    if (value.length <= 4) {
                      setFormData({ ...formData, tag: value });
                    }
                  }}
                  maxLength="4"
                  minLength="2"
                  placeholder={t`Enter faction tag (e.g., ABC1)`}
                  style={{ textTransform: 'uppercase' }}
                />
                <small>{t`Alphanumeric characters only, 2-4 characters. This will appear in chat as [TAG] before member names.`}</small>
              </div>
              <div>
                <label>{t`Faction Flag`}</label>
                <div className="file-upload">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                  {flagPreview ? (
                    <div className="preview-container">
                      <img
                        src={flagPreview}
                        alt={t`Flag preview`}
                        className="preview-image"
                      />
                      <button
                        type="button"
                        className="remove-image-btn"
                        onClick={() => {
                          setFlagPreview(null);
                          setFormData({ ...formData, flag: null });
                        }}
                      >
                        {t`Remove Image`}
                      </button>
                    </div>
                  ) : (
                    <>
                      <FaUpload className="file-upload-icon" />
                      <div className="file-upload-text">
                        {t`Click or drag an image to upload`}
                        <div className="file-upload-info">
                          {t`Max size: 10MB`}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="faction.modal-actions">
                <button type="submit">{t`Create Faction`}</button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFlagPreview(null);
                  }}
                >
                  {t`Cancel`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {factions.length === 0 ? (
        <div className="no-factions">
          <FaFlag size={48} />
          <h3>{t`No Factions Yet`}</h3>
          <p>{t`Be the first to create a faction!`}</p>
        </div>
      ) : (
        <div className="factions-list">
          {sortFactions(factions).filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase())).map(renderFactionCard)}
        </div>
      )}

      <div className="faction-charts">
        <div className="chart-container">
          <h3>{t`Top 5 Factions - Daily Pixels`}</h3>
          <Line data={chartData.dailyPixels} options={lineChartOptions} />
        </div>

        <div className="chart-container">
          <h3>{t`Top 5 Factions - Total Pixels`}</h3>
          <Line data={chartData.totalPixels} options={lineChartOptions} />
        </div>

        <div className="chart-container">
          <h3>{t`Top 5 Factions - Member Distribution`}</h3>
          <Doughnut data={chartData.memberDistribution} options={doughnutChartOptions} />
        </div>
      </div>

      {showTransferModal && selectedMember && (
        <div className="faction.modal">
          <div className="faction.modal-content">
            <h3>{t`Transfer Ownership`}</h3>
            <p>{t`Are you sure you want to transfer ownership to ${selectedMember.name}?`}</p>
            <div className="modal-actions">
              <button onClick={handleTransferOwnership}>{t`Confirm Transfer`}</button>
              <button onClick={() => {
                setShowTransferModal(false);
                setSelectedMember(null);
              }}>{t`Cancel`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Factions; 