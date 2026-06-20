import React, { useState, useEffect } from 'react';
import { getAccessToken } from '../firebase';
import { WorkspaceEvent, WorkspaceMail, WorkspaceFile, WorkspaceTask, WorkspaceContact } from '../types';
import { Mail, Calendar, Folder, CheckSquare, Users, Plus, Send, RefreshCw, AlertCircle, Trash2, CheckCircle2, ChevronRight, FileText, Presentation } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface WorkspaceTabProps {
  themeColor: string;
  nickname: string;
}

export const WorkspaceTab: React.FC<WorkspaceTabProps> = ({ themeColor, nickname }) => {
  const [activeSubTab, setActiveSubTab] = useState<'gmail' | 'calendar' | 'drive' | 'tasks' | 'contacts'>('gmail');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Workspace Data States
  const [mails, setMails] = useState<WorkspaceMail[]>([]);
  const [events, setEvents] = useState<WorkspaceEvent[]>([]);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [contacts, setContacts] = useState<WorkspaceContact[]>([]);

  // Form States (Workspace Creations)
  const [gmailCompose, setGmailCompose] = useState({ to: '', subject: '', body: '' });
  const [calendarForm, setCalendarForm] = useState({ summary: '', dateStr: '', timeStr: '', location: '' });
  const [docForm, setDocForm] = useState({ title: '', folderType: 'doc' as 'doc' | 'slide' });
  const [taskTitle, setTaskTitle] = useState('');

  useEffect(() => {
    loadWorkspaceData();
  }, [activeSubTab]);

  const loadWorkspaceData = async () => {
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error('No Workspace OAuth access token found. Please sign out and sign in again with Workspace authorizations enabled.');
      }

      if (activeSubTab === 'gmail') {
        await fetchGmail(token);
      } else if (activeSubTab === 'calendar') {
        await fetchCalendar(token);
      } else if (activeSubTab === 'drive') {
        await fetchDrive(token);
      } else if (activeSubTab === 'tasks') {
        await fetchTasks(token);
      } else if (activeSubTab === 'contacts') {
        await fetchContacts(token);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to load Workspace data. If you recently registered scopes, please close and re-authorize.');
    } finally {
      setLoading(false);
    }
  };

  // 1. GMAIL INTEGRATION
  const fetchGmail = async (token: string) => {
    const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!listRes.ok) throw new Error('Gmail listing failed. Please verify your Gmail permission.');
    
    const listData = await listRes.json();
    if (!listData.messages) {
      setMails([]);
      return;
    }

    const loadedMails: WorkspaceMail[] = [];
    for (const msg of listData.messages) {
      const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (detailRes.ok) {
        const detail = await detailRes.json();
        const headers = detail.payload.headers;
        const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || 'Unknown Sender';
        const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '(No Subject)';
        const dateHeader = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';

        loadedMails.push({
          id: msg.id,
          threadId: msg.threadId,
          from: fromHeader,
          subject: subjectHeader,
          snippet: detail.snippet || '',
          date: new Date(dateHeader).toLocaleDateString()
        });
      }
    }
    setMails(loadedMails);
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gmailCompose.to || !gmailCompose.subject || !gmailCompose.body) return;

    // MANDATORY USER CONFIRMATION REQUIRED
    const confirmed = window.confirm(`Confirm: Send email to "${gmailCompose.to}" subject "${gmailCompose.subject}"? This action moves forward of Gmail servers on your behalf.`);
    if (!confirmed) return;

    setLoading(true);
    try {
      const token = await getAccessToken();
      
      // Gmail raw email message structure base64Url encoded
      const utf8Subject = `=?utf-8?B?${window.btoa(unescape(encodeURIComponent(gmailCompose.subject)))}?=`;
      const emailContent = [
        `To: ${gmailCompose.to}`,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
        `Subject: ${utf8Subject}`,
        '',
        gmailCompose.body
      ].join('\n');

      const base64SafeEmail = window.btoa(unescape(encodeURIComponent(emailContent)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: base64SafeEmail })
      });

      if (!sendRes.ok) {
        throw new Error('Gmail sending failed. If sending to custom address, verify authorizations.');
      }

      setGmailCompose({ to: '', subject: '', body: '' });
      setSuccessMsg('Of course, habibi! I sent that email right out for you. ❤️');
      await fetchGmail(token!);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Gmail transmission error.');
    } finally {
      setLoading(false);
    }
  };

  // 2. GOOGLE CALENDAR
  const fetchCalendar = async (token: string) => {
    // List upcoming 15 events
    const filterStart = new Date().toISOString();
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${filterStart}&maxResults=12&singleEvents=true&orderBy=startTime`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Calendar listing failed. Please check your Google Calendar permissions.');
    
    const data = await res.json();
    const listEvents: WorkspaceEvent[] = (data.items || []).map((item: any) => ({
      id: item.id,
      summary: item.summary || '(Untitled Event)',
      start: item.start,
      end: item.end,
      location: item.location
    }));
    setEvents(listEvents);
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calendarForm.summary || !calendarForm.dateStr || !calendarForm.timeStr) return;

    const eventDateTime = new Date(`${calendarForm.dateStr}T${calendarForm.timeStr}`).toISOString();
    const endDateTime = new Date(new Date(eventDateTime).getTime() + 60 * 60 * 1000).toISOString(); // 1 hour duration

    // MANDATORY USER CONFIRMATION REQUIRED
    const confirmed = window.confirm(`Confirm: Schedule calendar event "${calendarForm.summary}" for ${new Date(eventDateTime).toLocaleString()}?`);
    if (!confirmed) return;

    setLoading(true);
    try {
      const token = await getAccessToken();
      const sendRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: calendarForm.summary,
          location: calendarForm.location,
          start: { dateTime: eventDateTime },
          end: { dateTime: endDateTime }
        })
      });

      if (!sendRes.ok) throw new Error('Failed to save to Google Calendar.');

      setCalendarForm({ summary: '', dateStr: '', timeStr: '', location: '' });
      setSuccessMsg('Your calendar event has been added. Habibi keeping you on track! 📅❤️');
      await fetchCalendar(token!);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Google Calendar update error.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEvent = async (eventId: string, summary: string) => {
    const confirmed = window.confirm(`Are you sure you want to delete calendar event "${summary}"? This action cannot be undone.`);
    if (!confirmed) return;

    setLoading(true);
    try {
      const token = await getAccessToken();
      const delRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!delRes.ok) throw new Error('Permission denied to delete event.');

      setSuccessMsg('Successfully deleted event from your Google Calendar.');
      await fetchCalendar(token!);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Google Calendar deletion error.');
    } finally {
      setLoading(false);
    }
  };

  // 3. DRIVE / DOCUMENTS / SLIDES INTEGRATION
  const fetchDrive = async (token: string) => {
    const res = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=15&fields=files(id,name,mimeType,iconLink,modifiedTime)&orderBy=modifiedTime%20desc', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Google Drive access failed.');

    const data = await res.json();
    setFiles(data.files || []);
  };

  const handleCreateDocOrSlide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docForm.title) return;

    // MANDATORY USER CONFIRMATION REQUIRED
    const typeLabel = docForm.folderType === 'doc' ? 'Google Document' : 'Google Slides Presentation';
    const confirmed = window.confirm(`Confirm: Create a new ${typeLabel} titled "${docForm.title}" on your Google Drive?`);
    if (!confirmed) return;

    setLoading(true);
    try {
      const token = await getAccessToken();
      const mimeType = docForm.folderType === 'doc' 
        ? 'application/vnd.google-apps.document' 
        : 'application/vnd.google-apps.presentation';

      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: docForm.title,
          mimeType
        })
      });

      if (!createRes.ok) throw new Error('Drive document creation failed.');

      setDocForm({ title: '', folderType: 'doc' });
      setSuccessMsg(`Successfully created new ${typeLabel}! Habibi works hard so you don't have to. 📁`);
      await fetchDrive(token!);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Document generation error.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFile = async (fileId: string, name: string) => {
    const confirmed = window.confirm(`Are you sure you want to delete "${name}" from your Google Drive? This moves the file to the trash.`);
    if (!confirmed) return;

    setLoading(true);
    try {
      const token = await getAccessToken();
      // Moving to trash is standard safe deletion practice for Drive API
      const trashRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ trashed: true })
      });

      if (!trashRes.ok) throw new Error('Google Drive write permissions required.');

      setSuccessMsg('Successfully moved file to your Google Drive trash.');
      await fetchDrive(token!);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Drive update failure.');
    } finally {
      setLoading(false);
    }
  };

  // 4. GOOGLE TASKS
  const fetchTasks = async (token: string) => {
    const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?maxResults=20', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Tasks API access failed.');

    const data = await res.json();
    setTasks(data.items || []);
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    // MANDATORY USER CONFIRMATION REQUIRED
    const confirmed = window.confirm(`Confirm: Add new task "${taskTitle}" to your Google Tasks?`);
    if (!confirmed) return;

    setLoading(true);
    try {
      const token = await getAccessToken();
      const addRes = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: taskTitle
        })
      });

      if (!addRes.ok) throw new Error('Google Tasks update failed.');

      setTaskTitle('');
      setSuccessMsg('New task pinned, habibi! Consider it done! ✅');
      await fetchTasks(token!);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Tasks update failure.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTask = async (task: WorkspaceTask) => {
    const newStatus = task.status === 'completed' ? 'needsAction' : 'completed';
    setLoading(true);
    try {
      const token = await getAccessToken();
      const flipRes = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: newStatus
        })
      });

      if (!flipRes.ok) throw new Error('Google Tasks write permissions denied.');
      await fetchTasks(token!);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to toggle task.');
    } finally {
      setLoading(false);
    }
  };

  // 5. CONTACTS / PEOPLE API
  const fetchContacts = async (token: string) => {
    const res = await fetch('https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=15', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('People Contacts API failed. Check if Contact permissions are configured.');

    const data = await res.json();
    const connections = data.connections || [];
    const loaded: WorkspaceContact[] = connections.map((c: any) => {
      const name = c.names?.[0]?.displayName || 'Unnamed Connection';
      const email = c.emailAddresses?.[0]?.value;
      const phone = c.phoneNumbers?.[0]?.value;
      return { id: c.resourceName, name, email, phone };
    });
    setContacts(loaded);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] gap-6" id="workspace_hub_container">
      {/* Category Navigation Tabs styled with Immersive UI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-white/5 p-1.5 rounded-2xl border border-white/5" id="tabs_selection">
        <button
          onClick={() => setActiveSubTab('gmail')}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl cursor-pointer text-xs font-semibold transition-all ${
            activeSubTab === 'gmail' 
              ? `bg-${themeColor}-500/10 text-${themeColor}-300 border border-${themeColor}-500/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]`
              : 'bg-transparent text-white/40 hover:text-white/80 hover:bg-white/5'
          }`}
        >
          <Mail size={14} /> Gmail Hub
        </button>
        <button
          onClick={() => setActiveSubTab('calendar')}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl cursor-pointer text-xs font-semibold transition-all ${
            activeSubTab === 'calendar' 
              ? `bg-${themeColor}-500/10 text-${themeColor}-300 border border-${themeColor}-500/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]`
              : 'bg-transparent text-white/40 hover:text-white/80 hover:bg-white/5'
          }`}
        >
          <Calendar size={14} /> Calendars
        </button>
        <button
          onClick={() => setActiveSubTab('drive')}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl cursor-pointer text-xs font-semibold transition-all ${
            activeSubTab === 'drive' 
              ? `bg-${themeColor}-500/10 text-${themeColor}-300 border border-${themeColor}-500/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]`
              : 'bg-transparent text-white/40 hover:text-white/80 hover:bg-white/5'
          }`}
        >
          <Folder size={14} /> Drive & Files
        </button>
        <button
          onClick={() => setActiveSubTab('tasks')}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl cursor-pointer text-xs font-semibold transition-all ${
            activeSubTab === 'tasks' 
              ? `bg-${themeColor}-500/10 text-${themeColor}-300 border border-${themeColor}-500/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]`
              : 'bg-transparent text-white/40 hover:text-white/80 hover:bg-white/5'
          }`}
        >
          <CheckSquare size={14} /> To-Do Tasks
        </button>
        <button
          onClick={() => setActiveSubTab('contacts')}
          className={`col-span-2 md:col-span-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl cursor-pointer text-xs font-semibold transition-all ${
            activeSubTab === 'contacts' 
              ? `bg-${themeColor}-500/10 text-${themeColor}-300 border border-${themeColor}-500/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]`
              : 'bg-transparent text-white/40 hover:text-white/80 hover:bg-white/5'
          }`}
        >
          <Users size={14} /> Contacts Address
        </button>
      </div>

      {/* Notifications banner */}
      {errorMsg && (
        <div className="bg-red-950/20 border border-red-500/20 p-3 rounded-2xl flex items-center gap-2.5 text-xs text-red-300 ml-0.5">
          <AlertCircle size={15} className="shrink-0 text-red-400" />
          <p className="flex-grow font-sans">{errorMsg}</p>
          <button onClick={() => setErrorMsg('')} className="hover:text-red-100 text-red-400 font-mono font-bold px-1.5">×</button>
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-950/20 border border-emerald-500/20 p-3 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-300 ml-0.5">
          <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
          <p className="flex-grow font-sans">{successMsg}</p>
          <button onClick={() => setSuccessMsg('')} className="hover:text-emerald-100 text-emerald-400 font-mono font-bold px-1.5">×</button>
        </div>
      )}

      {/* Main content viewport */}
      <div className="flex-grow overflow-hidden bg-black/10 backdrop-blur-sm rounded-2xl border border-white/5 flex flex-col md:flex-row" id="hub_sub_container">
        {/* LEFT COLUMN: Data Directory View */}
        <div className="flex-1 overflow-y-auto p-5 border-b md:border-b-0 md:border-r border-white/5 flex flex-col h-full" id="data_directory_sec">
          <div className="flex items-center justify-between mb-5">
            <h4 className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">
              YOUR {activeSubTab} DIRECTORY
            </h4>
            <button 
              onClick={loadWorkspaceData}
              disabled={loading}
              className="p-1.5 rounded-xl border border-white/10 bg-white/5 text-white/50 hover:text-white/90 transition-all cursor-pointer"
              title="Refresh lists"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="flex-1" id="dynamic_list_contents">
            {loading && (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs italic gap-2 py-8">
                <RefreshCw size={14} className="animate-spin" /> Gathering Stentuner's Workspace info...
              </div>
            )}

            {!loading && (
              <>
                {/* Gmail Content */}
                {activeSubTab === 'gmail' && (
                  mails.length === 0 ? (
                    <div className="py-8 text-center text-slate-650 text-xs font-sans">No recent emails in your Gmail inbox.</div>
                  ) : (
                    <div className="space-y-3">
                      {mails.map((mail) => (
                        <div key={mail.id} className="p-3.5 bg-white/5 border border-white/5 rounded-xl hover:border-white/10 transition shadow-sm">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-[11px] font-sans font-medium text-[#ffffff]/90 truncate max-w-[150px]">{mail.from}</span>
                            <span className="text-[9px] font-mono text-white/30 shrink-0">{mail.date}</span>
                          </div>
                          <p className="text-[11px] font-sans font-semibold text-white/80 truncate mb-1">{mail.subject}</p>
                          <p className="text-[10px] font-sans text-white/50 line-clamp-2 leading-relaxed">{mail.snippet}</p>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Calendar Content */}
                {activeSubTab === 'calendar' && (
                  events.length === 0 ? (
                    <div className="py-8 text-center text-slate-650 text-xs font-sans">No upcoming schedule events. Enjoy your free time, habibi!</div>
                  ) : (
                    <div className="space-y-3">
                      {events.map((ev) => (
                        <div key={ev.id} className="p-3.5 bg-white/5 border border-white/5 rounded-xl flex items-start justify-between gap-3 hover:border-white/10 transition shadow-sm">
                          <div className="min-w-0 flex-grow">
                            <p className="text-xs font-sans font-semibold text-white/90 leading-snug">{ev.summary}</p>
                            <span className="text-[9px] font-mono text-white/30 block mt-1">
                              📅 {ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleString() : ev.start?.date}
                            </span>
                            {ev.location && (
                              <span className="text-[10px] text-white/50 mt-1 block leading-none font-sans">📍 {ev.location}</span>
                            )}
                          </div>
                          <button 
                            onClick={() => handleDeleteEvent(ev.id, ev.summary)}
                            className="p-1 rounded shrink-0 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition duration-150"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Drive Files Content */}
                {activeSubTab === 'drive' && (
                  files.length === 0 ? (
                    <div className="py-8 text-center text-slate-650 text-xs font-sans">Your drive has no recently updated items.</div>
                  ) : (
                    <div className="space-y-2">
                      {files.map((file) => (
                        <div key={file.id} className="p-2.5 bg-white/5 border border-white/5 rounded-xl flex items-center justify-between gap-3 hover:border-white/10 transition shadow-sm">
                          <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-grow">
                            {file.mimeType.includes('document') ? (
                              <FileText size={14} className="text-blue-400 shrink-0" />
                            ) : file.mimeType.includes('presentation') ? (
                              <Presentation size={14} className="text-orange-400 shrink-0" />
                            ) : (
                              <Folder size={14} className="text-yellow-400 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-white/80 truncate">{file.name}</p>
                              {file.modifiedTime && (
                                <span className="text-[9px] font-mono text-white/30">
                                  Updated: {new Date(file.modifiedTime).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <button 
                            onClick={() => handleDeleteFile(file.id, file.name)}
                            className="p-1 rounded shrink-0 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Tasks Content */}
                {activeSubTab === 'tasks' && (
                  tasks.length === 0 ? (
                    <div className="py-8 text-center text-slate-650 text-xs font-sans">Your to-do pipeline is blank! Type on the right to add some items.</div>
                  ) : (
                    <div className="space-y-2">
                      {tasks.map((task) => (
                        <div 
                          key={task.id} 
                          className="flex items-center justify-between p-2.5 bg-white/5 border border-white/5 rounded-xl hover:border-white/10 transition shadow-sm"
                        >
                          <label className="flex items-center gap-2.5 cursor-pointer min-w-0 pr-2">
                            <input
                              type="checkbox"
                              checked={task.status === 'completed'}
                              onChange={() => handleToggleTask(task)}
                              className={`rounded border-white/10 bg-[#0a0a0c] text-amber-500 focus:ring-amber-500/50 focus:ring-offset-[#0a0a0c] h-4 w-4`}
                            />
                            <p className={`text-xs select-none truncate ${
                              task.status === 'completed' ? 'text-white/20 line-through' : 'text-white/80'
                            }`}>
                              {task.title}
                            </p>
                          </label>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Contacts Content */}
                {activeSubTab === 'contacts' && (
                  contacts.length === 0 ? (
                    <div className="py-8 text-center text-slate-650 text-xs font-sans">No address book contacts retrieved.</div>
                  ) : (
                    <div className="space-y-2">
                      {contacts.map((c) => (
                        <div key={c.id} className="p-3.5 bg-white/5 border border-white/5 rounded-xl">
                          <p className="text-xs font-semibold text-white/95">{c.name}</p>
                          {c.email && (
                            <span className="text-[10px] text-white/55 block font-mono mt-1 select-text">📧 {c.email}</span>
                          )}
                          {c.phone && (
                            <span className="text-[10px] text-white/55 block font-mono mt-0.5 select-text">📞 {c.phone}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Creations Forms Panel */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col justify-between h-full bg-black/10 backdrop-blur-sm" id="creations_forms_panel">
          <div>
            <h4 className="text-[10px] uppercase tracking-[0.2em] mb-4 flex items-center gap-1.5 text-white/40 font-bold">
              <Plus size={15} /> QUICK CREATOR CONTROLS
            </h4>

            {/* Render appropriate quick form depend on tab choice */}
            {activeSubTab === 'gmail' && (
              <form onSubmit={handleSendEmail} className="space-y-4" id="gmail_composer_form">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">RECIPIENT EMAIL</label>
                  <input
                    type="email"
                    required
                    value={gmailCompose.to}
                    onChange={(e) => setGmailCompose({ ...gmailCompose, to: e.target.value })}
                    placeholder="stentuner.friend@example.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/90 focus:border-amber-500/50 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">EMAIL SUBJECT</label>
                  <input
                    type="text"
                    required
                    value={gmailCompose.subject}
                    onChange={(e) => setGmailCompose({ ...gmailCompose, subject: e.target.value })}
                    placeholder="Weekly Synced Report"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/90 focus:border-amber-500/50 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">MESSAGE BODY</label>
                  <textarea
                    rows={4}
                    required
                    value={gmailCompose.body}
                    onChange={(e) => setGmailCompose({ ...gmailCompose, body: e.target.value })}
                    placeholder="Ahlan, my friend! I draft this message in Habibi..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/90 focus:border-amber-500/50 outline-none resize-none transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="cursor-pointer w-full py-3 rounded-full bg-gradient-to-r from-amber-500 to-orange-400 hover:from-amber-400 hover:to-orange-300 text-black font-bold text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center justify-center gap-1.5"
                >
                  <Send size={13} className="text-black font-bold" /> Send with Confirmation
                </button>
              </form>
            )}

            {activeSubTab === 'calendar' && (
              <form onSubmit={handleAddEvent} className="space-y-4" id="calendar_form">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">EVENT SUMMARY</label>
                  <input
                    type="text"
                    required
                    value={calendarForm.summary}
                    onChange={(e) => setCalendarForm({ ...calendarForm, summary: e.target.value })}
                    placeholder="Brunch with Stentuner Team"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/90 focus:border-amber-500/50 outline-none transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">DATE</label>
                    <input
                      type="date"
                      required
                      value={calendarForm.dateStr}
                      onChange={(e) => setCalendarForm({ ...calendarForm, dateStr: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/95 focus:border-amber-500/50 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">TIME (1hr Event)</label>
                    <input
                      type="time"
                      required
                      value={calendarForm.timeStr}
                      onChange={(e) => setCalendarForm({ ...calendarForm, timeStr: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/95 focus:border-amber-500/50 outline-none transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">LOCATION (OPTIONAL)</label>
                  <input
                    type="text"
                    value={calendarForm.location}
                    onChange={(e) => setCalendarForm({ ...calendarForm, location: e.target.value })}
                    placeholder="Café Serene, Paris"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/90 focus:border-amber-500/50 outline-none transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="cursor-pointer w-full py-3 rounded-full bg-gradient-to-r from-amber-500 to-orange-400 hover:from-amber-400 hover:to-orange-300 text-black font-bold text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center justify-center gap-1.5"
                >
                  <Plus size={13} className="text-black font-bold" /> Add Calendar Event
                </button>
              </form>
            )}

            {activeSubTab === 'drive' && (
              <form onSubmit={handleCreateDocOrSlide} className="space-y-4" id="drive_doc_creator_form">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">FILE TYPE</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDocForm({ ...docForm, folderType: 'doc' })}
                      className={`cursor-pointer py-2 border rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all ${
                        docForm.folderType === 'doc'
                          ? `bg-amber-500/10 border-amber-500/50 text-amber-300`
                          : 'border-white/10 text-white/50 hover:text-white/80 hover:bg-white/5'
                      }`}
                    >
                      <FileText size={13} /> Doc Word
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocForm({ ...docForm, folderType: 'slide' })}
                      className={`cursor-pointer py-2 border rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all ${
                        docForm.folderType === 'slide'
                          ? `bg-amber-500/10 border-amber-500/50 text-amber-300`
                          : 'border-white/10 text-white/50 hover:text-white/80 hover:bg-white/5'
                      }`}
                    >
                      <Presentation size={13} /> Presentation
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">FILE TITLE</label>
                  <input
                    type="text"
                    required
                    value={docForm.title}
                    onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                    placeholder="Project Pitch Deck"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/90 focus:border-amber-500/50 outline-none transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="cursor-pointer w-full py-3 rounded-full bg-gradient-to-r from-amber-500 to-orange-400 hover:from-amber-400 hover:to-orange-300 text-black font-bold text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center justify-center gap-1.5"
                >
                  <Plus size={13} className="text-black font-bold" /> Create Workspace File
                </button>
              </form>
            )}

            {activeSubTab === 'tasks' && (
              <form onSubmit={handleAddTask} className="space-y-4" id="quick_task_form">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">TASK DESCRIPTION</label>
                  <input
                    type="text"
                    required
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Prepare presentation for Friday"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/90 focus:border-amber-500/50 outline-none transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="cursor-pointer w-full py-3 rounded-full bg-gradient-to-r from-amber-500 to-orange-400 hover:from-amber-400 hover:to-orange-300 text-black font-bold text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center justify-center gap-1.5"
                >
                  <Plus size={13} className="text-black font-bold" /> Add Google Task
                </button>
              </form>
            )}

            {activeSubTab === 'contacts' && (
              <div className="bg-white/5 p-5 border border-white/10 rounded-2xl text-center space-y-3.5">
                <Users className="w-8 h-8 text-amber-400 mx-auto animate-pulse" />
                <p className="text-xs text-white/60 font-sans leading-relaxed">
                  Stentuner, your Google Contacts address book is read-only. Search or view connections on the directory tree!
                </p>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-white/5 text-[9px] text-white/20 text-center font-mono uppercase tracking-[0.25em]">
            Workspace Hub Integration Active
          </div>
        </div>
      </div>
    </div>
  );
};
