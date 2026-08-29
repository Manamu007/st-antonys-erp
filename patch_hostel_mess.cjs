const fs = require('fs');

let content = fs.readFileSync('src/pages/Hostel.tsx', 'utf8');

const regex = /function HostelMess\(\) \{\s*return \(\s*<div.*?<\/div>\s*\);\s*\}/s;

const newHostelMess = `function HostelMess() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('hostel_mess_manage');
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [menu, setMenu] = useState<Record<string, { breakfast: string, lunch: string, snacks: string, dinner: string }>>({
    Monday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
    Tuesday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
    Wednesday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
    Thursday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
    Friday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
    Saturday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
    Sunday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
  });

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const meals = ['breakfast', 'lunch', 'snacks', 'dinner'];

  useEffect(() => {
    const loadMenu = async () => {
      try {
        const data = await dbService.list('hostel_mess');
        if (data && data.length > 0) {
          const loadedMenu = data[0].menu;
          if (loadedMenu) {
            setMenu(loadedMenu);
          }
        }
      } catch (error) {
        console.error("Failed to load mess menu", error);
      } finally {
        setLoading(false);
      }
    };
    loadMenu();
  }, []);

  const handleSave = async () => {
    try {
      setLoading(true);
      await dbService.update('hostel_mess', 'weekly_menu', { menu }, true);
      toast.success("Hostel mess menu updated successfully");
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save menu", error);
      toast.error("Failed to save menu");
    } finally {
      setLoading(false);
    }
  };

  const handleMenuChange = (day: string, meal: string, value: string) => {
    setMenu(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [meal]: value
      }
    }));
  };

  if (loading) {
    return <div className="animate-pulse h-64 bg-neutral-100 rounded-2xl w-full"></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-neutral-200">
        <div className="flex items-center gap-4">
          <Utensils className="w-12 h-12 text-primary" />
          <div>
            <h3 className="text-xl font-bold text-neutral-800">Mess Timetable & Menu</h3>
            <p className="text-neutral-500">Manage daily breakfast, lunch, snacks, and dinner menus.</p>
          </div>
        </div>
        
        {canManage && (
          <div className="flex items-center gap-3">
             {isEditing ? (
               <>
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 border border-neutral-200 text-neutral-600 bg-white font-bold rounded-xl hover:bg-neutral-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSave}
                    className="px-6 py-2 bg-emerald-600 text-white font-black rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
                  >
                    Save Changes
                  </button>
               </>
             ) : (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="px-6 py-2 bg-primary text-white font-black rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                >
                  Edit Menu
                </button>
             )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-left font-mono text-sm min-w-[800px]">
          <thead className="bg-neutral-50 font-bold text-neutral-500 uppercase tracking-widest text-xs border-b border-neutral-100">
            <tr>
              <th className="py-4 px-6 w-32">Day</th>
              <th className="py-4 px-4 w-1/4">Breakfast</th>
              <th className="py-4 px-4 w-1/4">Lunch</th>
              <th className="py-4 px-4 w-1/4">Snacks</th>
              <th className="py-4 px-4 w-1/4">Dinner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {days.map(day => (
              <tr key={day} className="hover:bg-neutral-50/50 transition-colors">
                <td className="py-4 px-6 font-bold text-neutral-800">{day}</td>
                {meals.map((meal) => (
                  <td key={meal} className="py-4 px-4">
                    {isEditing ? (
                      <textarea
                        className="w-full px-3 py-2 border border-neutral-200 rounded-lg outline-none focus:border-primary resize-none text-sm bg-neutral-50 focus:bg-white transition-colors"
                        value={menu[day]?.[meal as keyof typeof menu[string]] || ''}
                        onChange={(e) => handleMenuChange(day, meal, e.target.value)}
                        placeholder={\`Enter \${meal}...\`}
                        rows={3}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap text-neutral-600">
                        {menu[day]?.[meal as keyof typeof menu[string]] || <span className="text-neutral-300 italic">Not specified</span>}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}`;

content = content.replace(regex, newHostelMess);

fs.writeFileSync('src/pages/Hostel.tsx', content);
