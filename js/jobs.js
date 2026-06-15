// ═════════════════════════════════════════════════════════════════════
// KUDASAI — Jobs Module
// ═════════════════════════════════════════════════════════════════════

window.KSJobs = {
  // List all jobs
  async list(options = {}) {
    const db = window.db;
    if (!db) return { data: [] };

    const { limit = 30, offset = 0 } = options;

    try {
      const { data, error } = await db.from('jobs')
        .select('*, profiles(username)')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      return { data, error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Create a job posting
  async create(userId, jobData) {
    const db = window.db;
    if (!db || !userId) return { error: 'Not authenticated' };

    const { title, company, location, type, description, apply_url } = jobData;

    if (!title?.trim() || !company?.trim() || !description?.trim()) {
      return { error: 'Title, company, and description are required' };
    }

    try {
      const { data, error } = await db.from('jobs').insert([{
        user_id: userId,
        title: title.trim(),
        company: company.trim(),
        location: location?.trim() || 'Remote',
        type: type || 'Full-time',
        description: description.trim(),
        apply_url: apply_url?.trim() || null
      }]).select('*').single();

      return { data, error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Delete a job posting
  async delete(jobId, userId) {
    const db = window.db;
    if (!db || !userId) return { error: 'Not authenticated' };

    try {
      const { error } = await db.from('jobs')
        .delete()
        .eq('id', jobId)
        .eq('user_id', userId);

      return { error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Get a single job
  async get(jobId) {
    const db = window.db;
    if (!db) return { error: 'No database' };

    try {
      const { data, error } = await db.from('jobs')
        .select('*, profiles(username)')
        .eq('id', jobId)
        .single();

      return { data, error };
    } catch (e) {
      return { error: e.message };
    }
  }
};
