import React from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';

// --- Helper Components ---

// Modal component for login and messages
const Modal = ({ children, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-2xl p-6 md:p-8 w-full max-w-sm relative">
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-2xl"
        aria-label="Close modal"
      >
        &times;
      </button>
      {children}
    </div>
  </div>
);

// --- Main App Component ---

export default function App() {
  // --- Firebase State ---
  const [db, setDb] = React.useState(null);
  const [auth, setAuth] = React.useState(null);
  const [isAuthReady, setIsAuthReady] = React.useState(false);
  
  // --- App State ---
  const [collateralType, setCollateralType] = React.useState('汽車機車');
  // Vehicle specific state
  const [vehicleType, setVehicleType] = React.useState('汽車');
  const [vehicleUsage, setVehicleUsage] = React.useState('1年');
  const [vehicleModel, setVehicleModel] = React.useState('');
  // Check specific state
  const [checkType, setCheckType] = React.useState('支票');
  const [checkAmount, setCheckAmount] = React.useState('');
  const [checkPeriod, setCheckPeriod] = React.useState('');
  // Common state
  const [loanAmount, setLoanAmount] = React.useState('');
  const [repaymentPeriods, setRepaymentPeriods] = React.useState('3');
  const [repaymentCondition, setRepaymentCondition] = React.useState('本利攤還');

  const [results, setResults] = React.useState(null);
  const [errorMessage, setErrorMessage] = React.useState('');

  // --- Admin State ---
  const [showLogin, setShowLogin] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [adminUsername, setAdminUsername] = React.useState('');
  const [adminPassword, setAdminPassword] = React.useState('');
  const [loginError, setLoginError] = React.useState('');
  
  // Default weights, used if Firestore has no data
  const defaultWeights = {
    initialRate: 2.5,
    vehicleWeights: { '汽車': 1.0, '機車': 1.15 },
    usagePeriodWeights: { '1年': 1.0, '3年': 1.05, '5年': 1.1, '10年以上': 1.25 },
    checkWeights: { '支票': 1.0, '客票': 1.2 },
    periodWeights: { '1': 1.1, '3': 1.0, '6': 0.98, '12': 0.95, '24': 1.05, '36': 1.1, '48': 1.15, '60': 1.2, '72': 1.25 },
    repaymentConditionWeights: { '本利攤還': 1.0, '先還利息': 1.1 },
  };
  
  const [weights, setWeights] = React.useState(defaultWeights);
  const [adminWeights, setAdminWeights] = React.useState(defaultWeights);


  // --- Firebase Initialization and Data Fetching ---
  React.useEffect(() => {
    // These variables are provided by the environment.
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : undefined;
    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'pawn-calculator-default';

    if (!firebaseConfig) {
      console.error("Firebase config not found. App will use default values.");
      return;
    }

    const app = initializeApp(firebaseConfig);
    const firestoreDb = getFirestore(app);
    const firebaseAuth = getAuth(app);
    
    setDb(firestoreDb);
    setAuth(firebaseAuth);

    onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        setIsAuthReady(true);
      } else {
        try {
            if(initialAuthToken) {
                await signInWithCustomToken(firebaseAuth, initialAuthToken);
            } else {
                await signInAnonymously(firebaseAuth);
            }
        } catch (error) {
            console.error("Anonymous sign-in failed:", error);
        }
      }
    });

    // Fetch weights from Firestore
    if (isAuthReady && firestoreDb) {
        const weightsDocRef = doc(firestoreDb, `artifacts/${appId}/public/data/config`, "weights");

        const unsubscribe = onSnapshot(weightsDocRef, 
            (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    // Basic validation to ensure fetched data has the right structure
                    if(data.initialRate && data.vehicleWeights) {
                        setWeights(data);
                        setAdminWeights(data);
                    } else {
                        console.log("Firestore data is malformed, using default weights.");
                        setWeights(defaultWeights);
                        setAdminWeights(defaultWeights);
                    }
                } else {
                    console.log("No weights document found in Firestore. Creating one with default values.");
                    setDoc(weightsDocRef, defaultWeights)
                        .then(() => {
                            setWeights(defaultWeights);
                            setAdminWeights(defaultWeights);
                        })
                        .catch(e => console.error("Error creating weights document:", e));
                }
            },
            (error) => {
                console.error("Error listening to weights document:", error);
            }
        );
        
        return () => unsubscribe();
    }

  }, [isAuthReady]);


  // --- Event Handlers ---

  const handleReset = () => {
    setCollateralType('汽車機車');
    setVehicleType('汽車');
    setVehicleUsage('1年');
    setVehicleModel('');
    setCheckType('支票');
    setCheckAmount('');
    setCheckPeriod('');
    setLoanAmount('');
    setRepaymentPeriods('3');
    setRepaymentCondition('本利攤還');
    setResults(null);
    setErrorMessage('');
  };

  const handleCalculate = () => {
    if (!loanAmount || parseFloat(loanAmount) <= 0) {
        setErrorMessage('請輸入有效的欲借金額。');
        return;
    }
    setErrorMessage('');

    let calculatedRate = weights.initialRate || 2.5;

    // Apply weights based on collateral type
    switch (collateralType) {
        case '汽車機車':
            calculatedRate *= (weights.vehicleWeights?.[vehicleType] || 1);
            calculatedRate *= (weights.usagePeriodWeights?.[vehicleUsage] || 1);
            break;
        case '支票客票':
            calculatedRate *= (weights.checkWeights?.[checkType] || 1);
            // Could add more logic for check amount/period here in a real scenario
            break;
        // Other types currently don't have special weights in this model
        case '房屋土地二胎':
        case '鑽石珠寶典當':
        case '代償降息整合':
        default:
            break;
    }

    // Apply general weights
    calculatedRate *= (weights.periodWeights?.[repaymentPeriods] || 1);
    calculatedRate *= (weights.repaymentConditionWeights?.[repaymentCondition] || 1);

    // Calculation logic
    const principal = parseFloat(loanAmount);
    const periods = parseInt(repaymentPeriods, 10);
    const annualRate = calculatedRate / 100;
    const monthlyRate = annualRate / 12;

    let schedule = [];
    let remainingBalance = principal;
    let totalPaid = 0;

    if (repaymentCondition === '本利攤還') {
        const monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, periods)) / (Math.pow(1 + monthlyRate, periods) - 1);
        if (isNaN(monthlyPayment) || !isFinite(monthlyPayment)) {
            setErrorMessage('無法計算，請檢查輸入或利率設定。');
            return;
        }

        for (let i = 1; i <= periods; i++) {
            const interestPaid = remainingBalance * monthlyRate;
            const principalPaid = monthlyPayment - interestPaid;
            remainingBalance -= principalPaid;
            
            // To prevent floating point inaccuracies making the last balance non-zero
            const finalRemaining = (i === periods) ? 0 : remainingBalance;
            
            schedule.push({
                period: i,
                payment: monthlyPayment,
                remaining: finalRemaining,
            });
            totalPaid += monthlyPayment;
        }
    } else { // '先還利息'
        const interestPayment = principal * monthlyRate;
        for (let i = 1; i <= periods; i++) {
            const paymentThisPeriod = (i === periods) ? interestPayment + principal : interestPayment;
            remainingBalance = (i === periods) ? 0 : principal;
            
            schedule.push({
                period: i,
                payment: paymentThisPeriod,
                remaining: remainingBalance,
            });
            totalPaid += paymentThisPeriod;
        }
    }
    
    setResults({
        schedule,
        totalPaid,
        finalRate: calculatedRate
    });
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (adminUsername === 'testpreview' && adminPassword === 'pwd1CVU@xkj6zvn1wjd') {
        setIsAdmin(true);
        setShowLogin(false);
        setLoginError('');
        setAdminUsername('');
        setAdminPassword('');
    } else {
        setLoginError('帳號或密碼錯誤');
    }
  };

  const handleAdminWeightChange = (category, key, value) => {
    setAdminWeights(prev => ({
        ...prev,
        [category]: {
            ...prev[category],
            [key]: parseFloat(value) || 0
        }
    }));
  };

  const handleAdminRateChange = (value) => {
      setAdminWeights(prev => ({ ...prev, initialRate: parseFloat(value) || 0 }));
  };

  const saveWeights = async () => {
    if (!db || !isAuthReady) {
        alert('資料庫未連接，無法儲存設定。');
        return;
    }
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'pawn-calculator-default';
    const weightsDocRef = doc(db, `artifacts/${appId}/public/data/config`, "weights");
    try {
        await setDoc(weightsDocRef, adminWeights, { merge: true });
        alert('權重設定已成功儲存！');
        setIsAdmin(false); // Exit admin mode after saving
    } catch(e) {
        console.error("Error saving weights: ", e);
        alert('儲存失敗，請查看控制台錯誤訊息。');
    }
  };
  
  // --- Render Functions ---

  const renderConditionalFields = () => {
    switch (collateralType) {
        case '汽車機車':
            return (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">汽車/機車</label>
                            <select value={vehicleType} onChange={e => setVehicleType(e.target.value)} className="w-full p-2 border border-amber-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500">
                                <option>汽車</option>
                                <option>機車</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">使用期間</label>
                            <select value={vehicleUsage} onChange={e => setVehicleUsage(e.target.value)} className="w-full p-2 border border-amber-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500">
                                <option>1年</option>
                                <option>3年</option>
                                <option>5年</option>
                                <option>10年以上</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">品牌及車款</label>
                        <input type="text" value={vehicleModel} onChange={e => setVehicleModel(e.target.value.slice(0, 100))} maxLength="100" placeholder="例：Toyota Altis" className="w-full p-2 border border-amber-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500" />
                    </div>
                </>
            );
        case '支票客票':
            return (
                <>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">支票/客票</label>
                        <select value={checkType} onChange={e => setCheckType(e.target.value)} className="w-full p-2 border border-amber-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500">
                            <option>支票</option>
                            <option>客票</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">票面金額 (元)</label>
                            <input type="number" value={checkAmount} onChange={e => setCheckAmount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="請輸入數字" className="w-full p-2 border border-amber-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">票期 (天)</label>
                            <input type="number" value={checkPeriod} onChange={e => setCheckPeriod(e.target.value.replace(/[^0-9]/g, ''))} placeholder="請輸入數字" className="w-full p-2 border border-amber-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500" />
                        </div>
                    </div>
                </>
            );
        default:
            return null;
    }
  };

  const renderAdminPanel = () => (
    <Modal onClose={() => setIsAdmin(false)}>
        <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-2">
            <h2 className="text-2xl font-bold text-center text-gray-800">後台權重設定</h2>
            
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-semibold text-gray-700">初始利率 (%)</label>
                    <input type="number" step="0.1" value={adminWeights.initialRate} onChange={e => handleAdminRateChange(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md mt-1" />
                </div>

                <div className="p-3 bg-amber-50 rounded-lg">
                    <h3 className="font-semibold mb-2 text-gray-700">汽車/機車加權</h3>
                    {Object.entries(adminWeights.vehicleWeights).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-center mb-1">
                            <label>{key}</label>
                            <input type="number" step="0.01" value={value} onChange={e => handleAdminWeightChange('vehicleWeights', key, e.target.value)} className="w-24 p-1 border border-gray-300 rounded-md text-right" />
                        </div>
                    ))}
                </div>

                <div className="p-3 bg-amber-50 rounded-lg">
                    <h3 className="font-semibold mb-2 text-gray-700">汽機車使用期間加權</h3>
                    {Object.entries(adminWeights.usagePeriodWeights).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-center mb-1">
                            <label>{key}</label>
                            <input type="number" step="0.01" value={value} onChange={e => handleAdminWeightChange('usagePeriodWeights', key, e.target.value)} className="w-24 p-1 border border-gray-300 rounded-md text-right" />
                        </div>
                    ))}
                </div>
                
                <div className="p-3 bg-amber-50 rounded-lg">
                    <h3 className="font-semibold mb-2 text-gray-700">支票/客票加權</h3>
                    {Object.entries(adminWeights.checkWeights).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-center mb-1">
                            <label>{key}</label>
                            <input type="number" step="0.01" value={value} onChange={e => handleAdminWeightChange('checkWeights', key, e.target.value)} className="w-24 p-1 border border-gray-300 rounded-md text-right" />
                        </div>
                    ))}
                </div>

                <div className="p-3 bg-amber-50 rounded-lg">
                    <h3 className="font-semibold mb-2 text-gray-700">還款期數加權</h3>
                    {Object.entries(adminWeights.periodWeights).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-center mb-1">
                            <label>{key} 期</label>
                            <input type="number" step="0.01" value={value} onChange={e => handleAdminWeightChange('periodWeights', key, e.target.value)} className="w-24 p-1 border border-gray-300 rounded-md text-right" />
                        </div>
                    ))}
                </div>

                 <div className="p-3 bg-amber-50 rounded-lg">
                    <h3 className="font-semibold mb-2 text-gray-700">還款條件加權</h3>
                    {Object.entries(adminWeights.repaymentConditionWeights).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-center mb-1">
                            <label>{key}</label>
                            <input type="number" step="0.01" value={value} onChange={e => handleAdminWeightChange('repaymentConditionWeights', key, e.target.value)} className="w-24 p-1 border border-gray-300 rounded-md text-right" />
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
                <button onClick={() => setIsAdmin(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">取消</button>
                <button onClick={saveWeights} className="px-6 py-2 bg-amber-500 text-white rounded-md hover:bg-amber-600 font-semibold">儲存設定</button>
            </div>
        </div>
    </Modal>
  );

  return (
    <div className="bg-amber-50 min-h-screen font-sans p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        
        <header className="text-center mb-8 relative">
            <h1 className="text-4xl md:text-5xl font-bold text-amber-900">當舖借款試算</h1>
            <p className="text-amber-700 mt-2">快速評估您的借款方案與利率</p>
             <button 
                onClick={() => setShowLogin(true)} 
                className="absolute top-0 right-0 text-sm bg-transparent text-amber-600 hover:text-amber-800 py-1 px-2 rounded">
                管理者登入
            </button>
        </header>

        {showLogin && (
            <Modal onClose={() => setShowLogin(false)}>
                <form onSubmit={handleLogin} className="space-y-4">
                    <h2 className="text-xl font-bold text-center text-gray-800">管理者登入</h2>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">帳號</label>
                        <input 
                            type="text" 
                            value={adminUsername}
                            onChange={e => setAdminUsername(e.target.value)}
                            className="w-full p-2 mt-1 border border-gray-300 rounded-md" 
                            placeholder="testpreview"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">密碼</label>
                        <input 
                            type="password" 
                            value={adminPassword}
                            onChange={e => setAdminPassword(e.target.value)}
                            className="w-full p-2 mt-1 border border-gray-300 rounded-md" 
                            placeholder="pwd1CVU@xkj6zvn1wjd"
                        />
                    </div>
                    {loginError && <p className="text-red-500 text-sm text-center">{loginError}</p>}
                    <button type="submit" className="w-full bg-amber-500 text-white py-2 rounded-md hover:bg-amber-600 font-semibold">
                        登入
                    </button>
                </form>
            </Modal>
        )}

        {isAdmin && renderAdminPanel()}

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-lg space-y-5">
                <h2 className="text-2xl font-bold text-amber-800 border-b-2 border-amber-200 pb-2">試算條件</h2>
                
                {/* Form starts here */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">擔保品類型</label>
                        <select value={collateralType} onChange={e => setCollateralType(e.target.value)} className="w-full p-2 border border-amber-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500">
                            <option>汽車機車</option>
                            <option>支票客票</option>
                            <option>房屋土地二胎</option>
                            <option>鑽石珠寶典當</option>
                            <option>代償降息整合</option>
                        </select>
                    </div>

                    {renderConditionalFields()}
                    
                    <hr className="border-t border-amber-200" />
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">欲借金額 (元)</label>
                        <input type="number" value={loanAmount} onChange={e => setLoanAmount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="請輸入欲借款的總金額" className="w-full p-2 border border-amber-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">還款期數 (月)</label>
                            <select value={repaymentPeriods} onChange={e => setRepaymentPeriods(e.target.value)} className="w-full p-2 border border-amber-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500">
                                {[1, 3, 6, 12, 24, 36, 48, 60, 72].map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">還款條件</label>
                            <select value={repaymentCondition} onChange={e => setRepaymentCondition(e.target.value)} className="w-full p-2 border border-amber-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500">
                                <option>本利攤還</option>
                                <option>先還利息</option>
                            </select>
                        </div>
                    </div>
                </div>

                {errorMessage && <p className="text-red-600 bg-red-100 p-3 rounded-md text-center">{errorMessage}</p>}
                
                <div className="flex space-x-4 pt-4">
                    <button onClick={handleCalculate} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
                        試算利率
                    </button>
                    <button onClick={handleReset} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
                        重設條件
                    </button>
                </div>
            </div>

            {/* Results Section */}
            <div className="bg-white p-6 rounded-lg shadow-lg">
                <h2 className="text-2xl font-bold text-amber-800 border-b-2 border-amber-200 pb-2 mb-4">方案結果</h2>
                {results ? (
                    <div className="space-y-4">
                        <div className="bg-amber-100 p-4 rounded-lg text-center">
                           <p className="text-amber-800">最終核算年利率</p>
                           <p className="text-3xl font-bold text-amber-900">{results.finalRate.toFixed(2)} %</p>
                        </div>
                        <div className="max-h-80 overflow-y-auto border rounded-lg">
                            <table className="w-full text-sm text-left text-gray-600">
                                <thead className="text-xs text-gray-700 uppercase bg-amber-200 sticky top-0">
                                    <tr>
                                        <th scope="col" className="px-4 py-3 text-center">期數</th>
                                        <th scope="col" className="px-4 py-3 text-right">本期還款金額</th>
                                        <th scope="col" className="px-4 py-3 text-right">剩餘本金</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.schedule.map(row => (
                                        <tr key={row.period} className="bg-white border-b border-amber-100 hover:bg-amber-50">
                                            <td className="px-4 py-2 text-center font-medium">{row.period}</td>
                                            <td className="px-4 py-2 text-right">{Math.round(row.payment).toLocaleString()} 元</td>
                                            <td className="px-4 py-2 text-right">{Math.round(row.remaining).toLocaleString()} 元</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="font-semibold text-gray-800 bg-amber-200 sticky bottom-0">
                                    <tr>
                                        <td className="px-4 py-3 text-center">總計</td>
                                        <td className="px-4 py-3 text-right text-base">{Math.round(results.totalPaid).toLocaleString()} 元</td>
                                        <td className="px-4 py-3"></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="text-center text-gray-500 pt-16">
                        <p>請填寫左側條件後</p>
                        <p>點擊「試算利率」以查看結果</p>
                    </div>
                )}
            </div>
        </main>
      </div>
    </div>
  );
}
