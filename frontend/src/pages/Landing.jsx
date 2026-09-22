import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cpu,
  Database,
  Gauge,
  Grid3X3,
  MonitorCog,
  ShieldCheck,
  Smartphone,
  Users,
  Wifi,
} from 'lucide-react'
import '../styles/landing.css';

const navItems = ['Home', 'Features', 'About', 'Contact']

const featureCards = [
  {
    title: 'Laboratory Scheduling',
    description: 'Manage laboratory schedules and class time slots.',
    icon: CalendarDays,
  },
  {
    title: 'PC Monitoring',
    description: 'Monitor computer availability, status, and system activity.',
    icon: MonitorCog,
  },
  {
    title: 'Occupancy Monitoring',
    description: 'View laboratory occupancy using smart monitoring technology.',
    icon: Users,
  },
  {
    title: 'Equipment Management',
    description: 'Keep track of laboratory computers and equipment.',
    icon: Database,
  },
  {
    title: 'Reports & Analytics',
    description: 'Generate useful reports and laboratory utilization information.',
    icon: BarChart3,
  },
  {
    title: 'Secure & Reliable',
    description: 'Designed with security, reliability, and centralized management in mind.',
    icon: ShieldCheck,
  },
]

const workflow = [
  {
    step: 'Step 1',
    title: 'Set Schedule',
    text: 'Administrators and instructors manage laboratory schedules.',
    icon: CalendarDays,
  },
  {
    step: 'Step 2',
    title: 'Monitor the Laboratory',
    text: 'SMARTLAB monitors workstation status, occupancy, and computer resources.',
    icon: Gauge,
  },
  {
    step: 'Step 3',
    title: 'View Information',
    text: 'Users can view schedules, availability, monitoring information, and reports from one centralized dashboard.',
    icon: Grid3X3,
  },
]

const stats = [
  { label: 'Total Computers', value: '128', tone: 'primary' },
  { label: 'Available Computers', value: '88', tone: 'success' },
  { label: 'Computers in Use', value: '40', tone: 'warning' },
  { label: 'Occupancy', value: '68%', tone: 'info' },
]

const scheduleItems = [
  { time: '08:00', title: 'Computer Engineering Lab 1', status: 'Open' },
  { time: '10:30', title: 'Software Design Class', status: 'In use' },
  { time: '13:00', title: 'Network Administration', status: 'Reserved' },
]

const systemStatus = [
  { name: 'Lab A', percent: 78, color: 'blue' },
  { name: 'Lab B', percent: 62, color: 'teal' },
  { name: 'Lab C', percent: 84, color: 'purple' },
]

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false)

  const scrollToSection = (event, targetId) => {
    if (targetId) {
      const section = document.getElementById(targetId)
      if (section) {
        event.preventDefault()
        section.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }

    setMenuOpen(false)
  }

  return (
    <div className="lp page-shell">
      <header className="topbar">
        <div className="container nav-wrap">
          <a href="#home" className="brand" aria-label="SMARTLAB home">
            <img src="/assets/icpep-logo.svg" alt="ICpEP logo" className="brand-logo" />
            <div className="brand-text">
              <span className="brand-name">SMARTLAB</span>
            </div>
          </a>

          <nav className={`nav ${menuOpen ? 'open' : ''}`} aria-label="Main navigation">
            {navItems.map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`} onClick={() => setMenuOpen(false)}>
                {item}
              </a>
            ))}
          </nav>

          <div className="nav-actions">
            <Link to="/login" className="login-btn">
              Sign in
            </Link>
            <button
              type="button"
              className="menu-toggle"
              aria-label="Toggle navigation"
              onClick={() => setMenuOpen((value) => !value)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <main>
        <section id="home" className="hero-section">
          <div className="circuit circuit-left" aria-hidden="true" />
          <div className="circuit circuit-right" aria-hidden="true" />

          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow-box">
                <span className="eyebrow-dot" />
                Computer Engineering Laboratory Management
              </div>

              <h1>
                Welcome to <span>Smart Lab</span>
              </h1>

              <p className="hero-subtitle">
                A modern computer laboratory management system designed to help students,
                instructors, and administrators manage laboratory schedules, workstation
                availability, occupancy, and computer resources in one centralized platform.
              </p>

              <div className="cta-row">
                <Link to="/register" className="primary-btn">
                  Get Started
                  <ArrowRight size={18} />
                </Link>
                <a href="#features" className="secondary-btn" onClick={(event) => scrollToSection(event, 'features')}>
                  Explore Features
                </a>
              </div>

              <div className="institutional-stack">
                <div className="institutional-badge">
                  <img src="/assets/essu-logo.svg" alt="ESSU logo" className="institutional-logo" />
                  <div>
                    <span className="institutional-label">Institutional Partner</span>
                    <strong>Eastern Samar State University</strong>
                  </div>
                </div>

                <div className="icpep-inline-brand">
                  <img src="/assets/icpep-logo.svg" alt="ICpEP logo" className="icpep-inline-logo" />
                  <div>
                    <span className="icpep-inline-label">Professional organization</span>
                    <strong>Institute of Computer Engineers of the Philippines</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="hero-visual" aria-label="SMARTLAB dashboard preview">
              <div className="dashboard-window">
                <div className="window-bar">
                  <span className="dot red" />
                  <span className="dot yellow" />
                  <span className="dot green" />
                </div>

                <div className="dashboard-header">
                  <div>
                    <p>System Overview</p>
                    <h3>Laboratory Status</h3>
                  </div>
                  <span className="status-pill success">Live</span>
                </div>

                <div className="mini-stats">
                  <div className="mini-stat">
                    <Cpu size={16} />
                    <div>
                      <span>Available</span>
                      <strong>88</strong>
                    </div>
                  </div>
                  <div className="mini-stat">
                    <Wifi size={16} />
                    <div>
                      <span>Online</span>
                      <strong>96%</strong>
                    </div>
                  </div>
                </div>

                <div className="dashboard-panels">
                  <div className="panel panel-lg">
                    <div className="panel-header">
                      <span>Laboratory Schedule</span>
                      <span className="tiny-chip">Today</span>
                    </div>
                    <ul className="schedule-list">
                      {scheduleItems.map((item) => (
                        <li key={item.time}>
                          <div>
                            <strong>{item.time}</strong>
                            <span>{item.title}</span>
                          </div>
                          <em>{item.status}</em>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="panel panel-sm">
                    <div className="panel-header">
                      <span>PC Monitoring</span>
                      <span className="tiny-chip good">Healthy</span>
                    </div>
                    <div className="meter-list">
                      {systemStatus.map((item) => (
                        <div key={item.name} className="meter-row">
                          <div className="meter-label">
                            <span>{item.name}</span>
                            <strong>{item.percent}%</strong>
                          </div>
                          <div className="meter-track">
                            <span className={`meter-fill ${item.color}`} style={{ width: `${item.percent}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="panel panel-sm">
                    <div className="panel-header">
                      <span>Occupancy</span>
                      <span className="tiny-chip neutral">68%</span>
                    </div>
                    <div className="radial-card">
                      <div className="radial-ring">
                        <div className="radial-inner">
                          <strong>68%</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="panel panel-wide">
                    <div className="panel-header">
                      <span>Recent Activity</span>
                      <span className="tiny-chip blue">Updated</span>
                    </div>
                    <div className="activity-list">
                      <div><CheckCircle2 size={14} /> System synchronized with lab resources</div>
                      <div><CheckCircle2 size={14} /> Computer availability refreshed</div>
                      <div><CheckCircle2 size={14} /> Occupancy data successfully updated</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="section-container features-section">
          <div className="container section-heading">
            <p className="section-kicker">Core Features</p>
            <h2>Everything You Need in One Platform</h2>
            <p className="section-subtitle">
              SMARTLAB provides the tools needed to make computer laboratory management easier,
              organized, and more efficient.
            </p>
          </div>

          <div className="container feature-grid">
            {featureCards.map(({ title, description, icon: Icon }) => (
              <Link key={title} to="/login" className="feature-card feature-link">
                <div className="feature-icon">
                  <Icon size={22} />
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="section-container workflow-section">
          <div className="container section-heading centered">
            <p className="section-kicker">How It Works</p>
            <h2>SMARTLAB in Three Simple Steps</h2>
          </div>

          <div className="container workflow-grid">
            {workflow.map(({ step, title, text, icon: Icon }) => (
              <a
                key={step}
                className="workflow-item workflow-link"
                href="#about"
                onClick={(event) => scrollToSection(event, 'about')}
              >
                <div className="workflow-icon-wrap">
                  <div className="workflow-icon">
                    <Icon size={22} />
                  </div>
                  <span className="workflow-step">{step}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </a>
            ))}
          </div>
        </section>

        <section className="section-container preview-section">
          <div className="container preview-intro">
            <div>
              <p className="section-kicker">Dashboard Preview</p>
              <h2>Operational Insight at a Glance</h2>
            </div>
            <a href="#about" className="text-link">
              Learn more <ChevronRight size={16} />
            </a>
          </div>

          <div className="container dashboard-preview">
            <div className="preview-row top-row">
              {stats.map(({ label, value, tone }) => (
                <a
                  key={label}
                  href="#features"
                  className={`metric-card ${tone} metric-link`}
                  onClick={(event) => scrollToSection(event, 'features')}
                >
                  <span>{label}</span>
                  <strong>{value}</strong>
                </a>
              ))}
            </div>

            <div className="preview-grid">
              <div className="preview-card large-card">
                <div className="panel-header">
                  <span>Today's Schedule</span>
                  <span className="tiny-chip blue">Updated</span>
                </div>
                <div className="schedule-table">
                  <div className="schedule-row header-row">
                    <span>Time</span>
                    <span>PC Number</span>
                    <span>Status</span>
                  </div>
                  {[
                    ['08:00', 'PC-001', 'Open'],
                    ['10:30', 'PC-024', 'Busy'],
                    ['13:00', 'PC-057', 'Reserved'],
                    ['15:30', 'PC-088', 'Available'],
                  ].map(([time, lab, status]) => (
                    <div key={time} className="schedule-row">
                      <span>{time}</span>
                      <span>{lab}</span>
                      <span className={`status-tag ${status.toLowerCase()}`}>{status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="preview-card">
                <div className="panel-header">
                  <span>PC Monitoring</span>
                  <span className="tiny-chip good">Healthy</span>
                </div>
                <div className="status-stack">
                  <div>
                    <span>CPU Usage</span>
                    <strong>42%</strong>
                  </div>
                  <div>
                    <span>Memory</span>
                    <strong>68%</strong>
                  </div>
                  <div>
                    <span>Network</span>
                    <strong>Stable</strong>
                  </div>
                </div>
              </div>

              <div className="preview-card">
                <div className="panel-header">
                  <span>Laboratory Status</span>
                  <span className="tiny-chip success">Online</span>
                </div>
                <div className="lab-status-list">
                  <div><span>Lab A</span><strong>12/18</strong></div>
                  <div><span>Lab B</span><strong>9/14</strong></div>
                  <div><span>Lab C</span><strong>15/20</strong></div>
                </div>
              </div>

              <div className="preview-card wide-card">
                <div className="panel-header">
                  <span>Reports</span>
                  <span className="tiny-chip neutral">Monthly</span>
                </div>
                <div className="bar-chart" aria-label="Reports chart">
                  {[50, 75, 55, 90, 68, 84, 96].map((bar, index) => (
                    <span key={index} style={{ height: `${bar}%` }} className="bar" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="section-container about-section">
          <div className="container about-grid">
            <div className="about-brand-stack">
              <div className="about-brand">
                <div className="about-logo-wrap">
                  <img src="/assets/essu-logo.svg" alt="ESSU logo" className="about-logo" />
                </div>
                <div className="brand-headline">
                  <span className="section-kicker">Institutional Platform</span>
                  <h2>Eastern Samar State University</h2>
                </div>
              </div>

              <div className="icpep-brand">
                <img src="/assets/icpep-logo.svg" alt="ICpEP logo" className="icpep-logo" />
                <div>
                  <span className="icpep-label">Institute of Computer Engineers of the Philippines</span>
                  <strong>ICpEP</strong>
                </div>
              </div>
            </div>

            <div className="about-copy">
              <p>
                SMARTLAB is a Computer Engineering laboratory management platform for Eastern
                Samar State University, designed to support organized laboratory scheduling, PC
                monitoring, occupancy monitoring, and centralized laboratory management across
                university facilities.
              </p>
            </div>
          </div>
        </section>

        <section className="section-container cta-section">
          <div className="container cta-box">
            <div>
              <p className="section-kicker light">Ready to modernize?</p>
              <h2>Ready to Make Laboratory Management Smarter?</h2>
            </div>
            <p>
              Manage schedules, monitor computers, and keep laboratory operations organized with
              SMARTLAB.
            </p>
            <Link to="/register" className="primary-btn cta-btn">
              Get Started
            </Link>
          </div>
        </section>
      </main>

      <footer id="contact" className="site-footer">
        <div className="container footer-grid">
          <div className="footer-brand">
            <div className="brand footer-brand-wrap">
              <img src="/assets/icpep-logo.svg" alt="ICpEP logo" className="brand-logo" />
              <div className="brand-text">
                <span className="brand-name">SMARTLAB</span>
              </div>
            </div>
            <div className="footer-logos">
              <img src="/assets/icpep-logo.svg" alt="ICpEP logo" className="tiny-logo" />
              <img src="/assets/essu-logo.svg" alt="ESSU logo" className="tiny-logo" />
            </div>
          </div>

          <div className="footer-links">
            <h3>Quick Links</h3>
            <ul>
              <li><a href="#home">Home</a></li>
              <li><a href="#features">Features</a></li>
              <li><a href="#about">About</a></li>
              <li><a href="#contact">Contact</a></li>
            </ul>
          </div>

          <div className="footer-meta">
            <h3>Institution</h3>
            <p>Computer Engineering Laboratory Management System</p>
            <p className="copyright">Copyright 2026 SMARTLAB</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Landing
