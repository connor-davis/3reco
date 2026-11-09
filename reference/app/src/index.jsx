import 'tw-elements';
import './index.css';

import App from './App';
import {Router} from '@solidjs/router';
import {registerSW} from 'virtual:pwa-register';
/* @refresh reload */
import {render} from 'solid-js/web';

if (typeof global === 'undefined') {
    window.global = window;
}

let Routed = () => {
    return (
        <Router>
            <App/>
        </Router>
    );
};

render(Routed, document.getElementById('root'));

const updateSW = registerSW({
    onNeedRefresh() {
    },
    onOfflineReady() {
    },
});

if (typeof window !== 'undefined') {
    import('./sw');
}
