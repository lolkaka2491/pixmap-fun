import express from 'express';
import { query } from '../data/sql/database';
import multer from 'multer';
import path from 'path';
import { sensitiveOperationRateLimit } from '../middleware/rateLimitMiddleware';

const router = express.Router();

// Configure multer with absolute path
const storage = multer.diskStorage({
    destination: '/root/pixelplanet/dist/avatars',
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1 * 1024 * 1024 // 1MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Only .jpg, .png, and .gif files are allowed'));
    }
});

// Search users endpoint with rate limiting
router.get('/search', sensitiveOperationRateLimit, async (req, res) => {
    const searchQuery = req.query.q;
    
    if (!searchQuery) {
        return res.status(400).json({ error: 'Search query is required' });
    }

    // Sanitize input - only allow alphanumeric characters, spaces, and basic punctuation
    const sanitizedQuery = searchQuery.replace(/[^a-zA-Z0-9\s\-_.,]/g, '');
    
    if (sanitizedQuery.length === 0) {
        return res.status(400).json({ error: 'Invalid search query' });
    }

    try {
        // Search by username or ID
        const results = await query(
            'SELECT id, name FROM Users WHERE name LIKE ? OR id = ? LIMIT 10',
            [`%${sanitizedQuery}%`, isNaN(sanitizedQuery) ? 0 : parseInt(sanitizedQuery, 10)]
        );

        return res.json(results);
    } catch (error) {
        console.error('User search error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/:id', async (req, res) => {
    const userId = req.params.id;

    try {
        const result = await query('SELECT id, name, flag, lastLogIn, bio, avatar FROM Users WHERE id = ?', [userId]);
        if (result.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result[0];
        
        // Always return JSON
        return res.json({
            id: user.id,
            name: user.name,
            flag: user.flag,
            lastLogIn: user.lastLogIn,
            bio: user.bio,
            avatar: user.avatar,
            createdAt: user.createdAt,
            // Add any other fields you want to expose
        });

    } catch (error) {
        console.error('Database query error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/:id/avatar', upload.single('avatar'), async (req, res) => {
    const userId = req.params.id;
    const { id } = req.body;
    
    console.log('Debug IDs:', {
        userId,
        id,
        body: req.body
    });

    if (Number(id) === Number(userId)) {
        try {
            await query('UPDATE Users SET avatar = ? WHERE id = ?', [req.file.filename, userId]);
            res.status(200).json({ message: 'Avatar updated successfully' });
        } catch (error) {
            console.error('Database update error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    } else {
        console.log('ID mismatch:', {
            id: Number(id),
            userId: Number(userId),
            comparison: Number(id) === Number(userId)
        });
        res.status(403).json({ error: 'This is not your account.' });
    }
});

router.post('/:id/bio', async (req, res) => {
    const targetUserId = req.params.id;
    let { bio } = req.body;

    // Get the current user's ID from their session
    const currentUserId = req.user?.id;

    // Check if user is logged in
    if (!currentUserId) {
        return res.status(401).json({ error: 'You must be logged in to update bio' });
    }

    // Sanitize and validate bio
    if (bio) {
        bio = bio.trim();
        // Remove any HTML tags and special characters
        bio = bio.replace(/<[^>]*>/g, '');
        bio = bio.replace(/[<>'"`;]/g, '');
        bio = bio.slice(0, 200);
    }

    if (!bio || bio.length === 0) {
        return res.status(400).json({ error: 'Bio cannot be empty' });
    }

    // Verify the user is updating their own bio
    if (Number(currentUserId) !== Number(targetUserId)) {
        console.log('Unauthorized bio update attempt:', {
            currentUserId,
            targetUserId,
            ip: req.ip
        });
        return res.status(403).json({ error: 'You can only update your own bio' });
    }

    try {
        await query('UPDATE Users SET bio = ? WHERE id = ?', [bio, targetUserId]);
        res.json({ message: 'Bio updated successfully' });
    } catch (error) {
        console.error('Database update error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

function getCountryName(flag) {
    const countryMap = {
        'ge': 'Georgia',
        'ua': 'Ukraine',
        'gr': 'Greece',
        'us': 'United States',
        'ca': 'Canada',
        'gb': 'United Kingdom',
        'de': 'Germany',
        'fr': 'France',
        'it': 'Italy',
        'es': 'Spain',
        'pl': 'Poland',
        'ru': 'Russia',
        'cn': 'China',
        'jp': 'Japan',
        'kr': 'South Korea',
        'in': 'India',
        'br': 'Brazil',
        'au': 'Australia',
        'mx': 'Mexico',
        'za': 'South Africa',
        'nl': 'Netherlands',
        'se': 'Sweden',
        'no': 'Norway',
        'fi': 'Finland',
        'dk': 'Denmark',
        'ie': 'Ireland',
        'pt': 'Portugal',
        'cz': 'Czech Republic',
        'sk': 'Slovakia',
        'hu': 'Hungary',
        'ro': 'Romania',
        'bg': 'Bulgaria',
        'at': 'Austria',
        'ch': 'Switzerland',
        'by': 'Belarus',
        'lt': 'Lithuania',
        'lv': 'Latvia',
        'ee': 'Estonia',
        'si': 'Slovenia',
        'hr': 'Croatia',
        'rs': 'Serbia',
        'ba': 'Bosnia and Herzegovina',
        'mk': 'North Macedonia',
        'al': 'Albania',
        'am': 'Armenia',
        'az': 'Azerbaijan',
        'kz': 'Kazakhstan',
        'uz': 'Uzbekistan',
        'tj': 'Tajikistan',
        'tm': 'Turkmenistan',
        'kg': 'Kyrgyzstan',
        'vn': 'Vietnam',
        'th': 'Thailand',
        'ph': 'Philippines',
        'id': 'Indonesia',
        'my': 'Malaysia',
        'sg': 'Singapore',
        'hk': 'Hong Kong',
        'tw': 'Taiwan',
        'np': 'Nepal',
        'bd': 'Bangladesh',
        'lk': 'Sri Lanka',
        'mm': 'Myanmar',
        'kh': 'Cambodia',
        'la': 'Laos',
        'mv': 'Maldives',
        'bt': 'Bhutan',
        'pk': 'Pakistan',
        'af': 'Afghanistan',
        'ir': 'Iran',
        'iq': 'Iraq',
        'sy': 'Syria',
        'jo': 'Jordan',
        'il': 'Israel',
        'ae': 'United Arab Emirates',
        'sa': 'Saudi Arabia',
        'qa': 'Qatar',
        'kw': 'Kuwait',
        'bh': 'Bahrain',
        'om': 'Oman',
        'ye': 'Yemen',
        'dz': 'Algeria',
        'ma': 'Morocco',
        'tn': 'Tunisia',
        'ly': 'Libya',
        'eg': 'Egypt',
        'sd': 'Sudan',
        'ss': 'South Sudan',
        'ci': 'Ivory Coast',
        'ng': 'Nigeria',
        'gh': 'Ghana',
        'ke': 'Kenya',
        'tz': 'Tanzania',
        'ug': 'Uganda',
        'rw': 'Rwanda',
        'zm': 'Zambia',
        'zw': 'Zimbabwe',
        'mg': 'Madagascar',
        'mu': 'Mauritius',
        'sc': 'Seychelles',
        'cm': 'Cameroon',
        'sn': 'Senegal',
        'ml': 'Mali',
        'ne': 'Niger',
        'bf': 'Burkina Faso',
        'tg': 'Togo',
        'bj': 'Benin',
        'lr': 'Liberia',
        'sl': 'Sierra Leone',
        'gw': 'Guinea-Bissau',
        'gn': 'Guinea',
        'cf': 'Central African Republic',
        'td': 'Chad',
        'cg': 'Congo',
        'cd': 'Democratic Republic of the Congo',
        'ao': 'Angola',
        'dz': 'Algeria',
        'et': 'Ethiopia',
        'so': 'Somalia',
        'dj': 'Djibouti',
        'er': 'Eritrea',
        'ke': 'Kenya',
        'ug': 'Uganda',
        'tz': 'Tanzania',
        'rw': 'Rwanda',
        'bi': 'Burundi',
        'mg': 'Madagascar',
        'mz': 'Mozambique',
        'na': 'Namibia',
        'bw': 'Botswana',
        'ls': 'Lesotho',
        'sz': 'Eswatini',
        'za': 'South Africa',
        'zm': 'Zambia',
        'zw': 'Zimbabwe',
        'sc': 'Seychelles',
        'mu': 'Mauritius',
        'km': 'Comoros',
        'dj': 'Djibouti',
        'cv': 'Cape Verde',
        'gq': 'Equatorial Guinea',
        'st': 'Sao Tome and Principe',
        'tl': 'Timor-Leste',
        'pg': 'Papua New Guinea',
        'fj': 'Fiji',
        'sb': 'Solomon Islands',
        'vu': 'Vanuatu',
        'ws': 'Samoa',
        'to': 'Tonga',
        'ck': 'Cook Islands',
        'nu': 'Niue',
        'tv': 'Tuvalu',
        'mh': 'Marshall Islands',
        'fm': 'Micronesia',
        'pw': 'Palau',
        'ki': 'Kiribati',
        'mp': 'Northern Mariana Islands',
        'gu': 'Guam',
        'pr': 'Puerto Rico',
        'vi': 'U.S. Virgin Islands',
        'as': 'American Samoa',
    };
    return countryMap[flag] || 'Unknown Country';
}

export default router; 