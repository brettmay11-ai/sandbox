// Classless accounts never inherit school-wide access. Admin scope is explicit.
function classroomScope(user, { alias = 'u', offset = 0, allowAdmin = false } = {}) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error('Invalid SQL alias');
  if (allowAdmin && user?.role === 'super_admin') return { clause:'', params:[] };
  if (!user?.class_id) return { clause:'AND FALSE', params:[] };
  return { clause:`AND ${alias}.class_id=$${offset + 1}`, params:[user.class_id] };
}

async function updateClassroomStudent(pool, user, studentId, field, value) {
  if (!['teacher', 'super_admin'].includes(user?.role)) return null;
  if (!['pin_hash', 'active', 'selected_team'].includes(field)) throw new Error('Invalid student field');
  const scope = classroomScope(user, { offset:2, allowAdmin:true });
  const result = await pool.query(
    `UPDATE users u SET ${field}=$2 WHERE u.id=$1 AND u.role='student' ${scope.clause} RETURNING u.id,u.selected_team,u.active`,
    [studentId, value, ...scope.params]
  );
  return result.rows[0] || null;
}

module.exports = { classroomScope, updateClassroomStudent };
